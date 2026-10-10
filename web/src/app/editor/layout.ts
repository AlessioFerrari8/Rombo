import ELK from 'elkjs/lib/elk.bundled.js';
import { GRID, entityBox, relBox } from '../domain/geometry';
import { Attribute, Diagram, Id, Point } from '../domain/model';

/** Spazio attorno a ogni nodo per gli attributi, che elk non conosce. */
const PAD = 72;
/** Un attributo composto (asta, ovale, parti a ventaglio) arriva molto piu' lontano. */
const PAD_COMPOSITE = 190;

const padFor = (attrs: Attribute[], none: number) =>
  attrs.some((a) => a.parts?.length) ? PAD_COMPOSITE : attrs.length ? PAD : none;

export async function computeLayout(d: Diagram): Promise<Record<Id, Point>> {
  const elk = new ELK();
  const children = [
    ...d.entities.map((e) => {
      const b = entityBox(e);
      const pad = padFor(e.attributes, 24);
      return { id: e.id, width: b.w + 2 * pad, height: b.h + 2 * pad };
    }),
    ...d.relationships.map((r) => {
      const b = relBox(r);
      const pad = padFor(r.attributes, 16);
      return { id: r.id, width: b.w + 2 * pad, height: b.h + 2 * pad };
    }),
  ];
  // l'associazione sta fra le sue entita': primo partecipante -> rombo -> gli altri
  const edges = [
    ...d.relationships.flatMap((r) =>
      r.participants.map((p, i) =>
        i === 0
          ? { id: `${r.id}:${i}`, sources: [p.entityId], targets: [r.id] }
          : { id: `${r.id}:${i}`, sources: [r.id], targets: [p.entityId] },
      ),
    ),
    ...d.generalizations.flatMap((g) => g.childIds.map((c) => ({ id: `${g.id}:${c}`, sources: [g.parentId], targets: [c] }))),
  ];
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '40',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.separateConnectedComponents': 'true',
    },
    children,
    edges,
  });
  const out: Record<Id, Point> = {};
  for (const c of graph.children ?? []) {
    out[c.id] = {
      x: Math.round(((c.x ?? 0) + (c.width ?? 0) / 2) / GRID) * GRID,
      y: Math.round(((c.y ?? 0) + (c.height ?? 0) / 2) / GRID) * GRID,
    };
  }
  return out;
}
