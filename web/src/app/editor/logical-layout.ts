import ELK from 'elkjs/lib/elk.bundled.js';
import { GRID } from '../domain/geometry';
import { tableRect } from '../domain/logical-geometry';
import { Id, LogicalDiagram, Point } from '../domain/model';

/** Chi riferisce sta a sinistra di chi e' riferito: le frecce FK vanno quasi sempre verso destra. */
export async function computeLogicalLayout(l: LogicalDiagram): Promise<Record<Id, Point>> {
  if (!l.tables.length) return {};
  const elk = new ELK();
  const children = l.tables.map((t) => {
    const r = tableRect(t);
    return { id: t.id, width: r.w, height: r.h };
  });
  const edges = l.tables.flatMap((t) =>
    t.foreignKeys.filter((f) => f.refTableId !== t.id).map((f) => ({ id: f.id, sources: [t.id], targets: [f.refTableId] })),
  );
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.separateConnectedComponents': 'true',
    },
    children,
    edges,
  });
  const out: Record<Id, Point> = {};
  for (const c of graph.children ?? []) {
    out[c.id] = { x: Math.round((c.x ?? 0) / GRID) * GRID, y: Math.round((c.y ?? 0) / GRID) * GRID };
  }
  return out;
}
