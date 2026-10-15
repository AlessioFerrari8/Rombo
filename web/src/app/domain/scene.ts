import {
  ATTR_STICK, AttrGeom, Bounds, Box, IsaGeom, attributeGeometry, boxBounds, compositeGeometry, entityBox, generalizationGeometry, labelBounds,
  participantGeometry, relBox, selfLoopGeometry, unionBounds,
} from './geometry';
import { AttrCard, Diagram, Entity, Id, Point, Relationship, isWeak } from './model';
import { Issue } from './validate';

export interface ShapeView {
  id: Id; box: Box; name: string; selected: boolean; error: boolean; issues: number;
  /** Entita' debole (identificata anche tramite un'associazione): doppio bordo. */
  weak?: boolean;
  /** Associazione identificante di un'entità debole: doppio rombo. */
  identifying?: boolean;
  /** Associazione binaria: 1:1, 1:N o N:N, dedotta dai massimi. */
  kindLabel?: string;
}
export interface PartView { id: Id; text: string; geom: AttrGeom; selected: boolean; error: boolean }
export interface AttrView {
  id: Id; ownerId: Id; text: string; geom: AttrGeom; key: boolean; card: AttrCard; selected: boolean; error: boolean;
  /** Attributo composto: ovale col nome al posto del pallino, e le parti a ventaglio. */
  composite?: { center: Point; rx: number; ry: number; parts: PartView[] };
}
export interface LinkView {
  key: string; relId: Id; index: number; from: Point; to: Point; points: Point[]; card: Point; cardText: string; missing: boolean;
  /** Partecipazione opzionale (minimo 0): linea tratteggiata. */
  optional: boolean;
  role?: string; rolePos: Point; roleAnchor: 'start' | 'end' | 'middle';
}
export interface IsaView { id: Id; geom: IsaGeom; label: string; selected: boolean; error: boolean }
export interface IdBarView { entityId: Id; points: Point[]; end: Point }
export interface Scene {
  entities: ShapeView[];
  relationships: ShapeView[];
  attributes: AttrView[];
  links: LinkView[];
  isas: IsaView[];
  idBars: IdBarView[];
  bounds: Bounds | null;
}

export function buildScene(d: Diagram, issues: Issue[], selection: ReadonlySet<Id>): Scene {
  const errorIds = new Set<Id>();
  const count = new Map<Id, number>();
  for (const i of issues) {
    if (i.severity !== 'error') continue;
    for (const t of i.targetIds) {
      errorIds.add(t);
      count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  const shape = (el: Entity | Relationship, box: Box): ShapeView => ({
    id: el.id, box, name: el.name, selected: selection.has(el.id), error: errorIds.has(el.id), issues: count.get(el.id) ?? 0,
  });
  const boxes = new Map<Id, Box>();
  const entities = d.entities.map((e) => {
    const b = entityBox(e);
    boxes.set(e.id, b);
    return { ...shape(e, b), weak: isWeak(e) };
  });
  const identifying = new Set(d.entities.flatMap((e) => e.primary?.externalVia ?? []));
  const relationships = d.relationships.map((r) => {
    const b = relBox(r);
    boxes.set(r.id, b);
    return { ...shape(r, b), kindLabel: kindLabel(r), identifying: identifying.has(r.id) };
  });

  const attributes: AttrView[] = [];
  const idBars: IdBarView[] = [];
  const pushAttrs = (owner: Entity | Relationship, box: Box, kind: 'rect' | 'rhombus') => {
    const primary = 'primary' in owner ? owner.primary : null;
    const simpleKey = primary && primary.attributeIds.length === 1 && !primary.externalVia.length ? primary.attributeIds[0] : null;
    for (const a of owner.attributes) {
      const text = a.card === '1,1' ? a.name : `${a.name} (${a.card})`;
      const base = { id: a.id, ownerId: owner.id, text, key: a.id === simpleKey, card: a.card, selected: selection.has(a.id), error: errorIds.has(a.id) };
      if (a.parts?.length) {
        const g = compositeGeometry(box, kind, a.angle, text, a.parts.length);
        attributes.push({
          ...base,
          // l'asta arriva al bordo dell'ovale; l'etichetta (per rinomina e limiti) sta al centro
          geom: { from: g.from, dot: g.stickEnd, label: g.center, anchor: 'middle' },
          composite: {
            center: g.center, rx: g.rx, ry: g.ry,
            parts: a.parts.map((p, i) => ({
              id: p.id, text: p.card === '1,1' ? p.name : `${p.name} (${p.card})`, geom: g.parts[i],
              selected: selection.has(p.id), error: errorIds.has(p.id),
            })),
          },
        });
      } else {
        attributes.push({ ...base, geom: attributeGeometry(box, kind, a.angle) });
      }
    }
  };
  d.entities.forEach((e) => pushAttrs(e, boxes.get(e.id)!, 'rect'));
  d.relationships.forEach((r) => pushAttrs(r, boxes.get(r.id)!, 'rhombus'));

  const links: LinkView[] = [];
  const linkEnd = new Map<string, { from: Point; to: Point }>();
  for (const r of d.relationships) {
    const rb = boxes.get(r.id)!;
    const selfLoop = r.participants.length === 2 && r.participants[0].entityId === r.participants[1].entityId;
    const loop = selfLoop && boxes.get(r.participants[0].entityId) ? selfLoopGeometry(rb, boxes.get(r.participants[0].entityId)!) : null;
    r.participants.forEach((p, index) => {
      const eb = boxes.get(p.entityId);
      if (!eb) return;
      const same = r.participants.filter((x) => x.entityId === p.entityId);
      const k = same.indexOf(p);
      const spread = same.length > 1 ? (k - (same.length - 1) / 2) * 0.5 : 0;
      const g = loop ? loop[index] : participantGeometry(rb, eb, spread);
      linkEnd.set(`${r.id}|${p.entityId}`, { from: g.points[g.points.length - 2], to: g.to });
      links.push({
        key: `${r.id}:${index}`, relId: r.id, index, from: g.from, to: g.to, points: g.points, card: g.card,
        cardText: `(${p.min ?? '?'},${p.max ?? '?'})`, missing: p.min === null || p.max === null, optional: p.min === 0,
        role: p.role, rolePos: g.mid, roleAnchor: g.roleAnchor ?? 'middle',
      });
    });
  }

  // identificatori composti o esterni: barra che attraversa le aste e finisce con un pallino pieno
  for (const e of d.entities) {
    const p = e.primary;
    if (!p || p.attributeIds.length + p.externalVia.length < 2) continue;
    const members: Array<{ angle: number; point: Point }> = [];
    for (const aid of p.attributeIds) {
      const v = attributes.find((a) => a.id === aid);
      if (!v) continue;
      const pt = { x: (v.geom.from.x + v.geom.dot.x) / 2, y: (v.geom.from.y + v.geom.dot.y) / 2 };
      members.push({ angle: Math.atan2(pt.y - e.pos.y, pt.x - e.pos.x), point: pt });
    }
    for (const rid of p.externalVia) {
      const l = linkEnd.get(`${rid}|${e.id}`);
      if (!l) continue;
      // sul ramo dell'associazione, appena fuori dall'entita' (come a meta' dell'asta di un attributo)
      const len = Math.hypot(l.from.x - l.to.x, l.from.y - l.to.y) || 1;
      const pt = { x: l.to.x + ((l.from.x - l.to.x) / len) * (ATTR_STICK / 2), y: l.to.y + ((l.from.y - l.to.y) / len) * (ATTR_STICK / 2) };
      members.push({ angle: Math.atan2(pt.y - e.pos.y, pt.x - e.pos.x), point: pt });
    }
    members.sort((a, b) => a.angle - b.angle);
    const box = boxes.get(e.id)!;
    const points = routeAround(box, members.map((m) => m.point));
    if (members.length < 2) continue;
    const last = points[points.length - 1];
    const r = Math.hypot(last.x - e.pos.x, last.y - e.pos.y);
    const base = Math.atan2(last.y - e.pos.y, last.x - e.pos.x);
    const end = [0.35, -0.35, 0.6, -0.6]
      .map((da) => ({ x: e.pos.x + Math.cos(base + da) * r, y: e.pos.y + Math.sin(base + da) * r }))
      .find((c) => !crossesBox(box, last, c)) ?? { x: last.x + (last.x - e.pos.x) * 0.3, y: last.y + (last.y - e.pos.y) * 0.3 };
    idBars.push({ entityId: e.id, points, end });
  }

  const isas: IsaView[] = [];
  for (const g of d.generalizations) {
    const pb = boxes.get(g.parentId);
    const cbs = g.childIds.map((c) => boxes.get(c)).filter((b): b is Box => !!b);
    if (!pb || !cbs.length) continue;
    isas.push({
      id: g.id, geom: generalizationGeometry(pb, cbs), label: `(${g.total ? 't' : 'p'},${g.exclusive ? 'e' : 's'})`,
      selected: selection.has(g.id), error: errorIds.has(g.id),
    });
  }

  const parts: Bounds[] = [...entities, ...relationships].map((s) => boxBounds(s.box));
  for (const a of attributes) {
    if (!a.composite) {
      parts.push(labelBounds(a.geom, a.text));
      continue;
    }
    const { center: c, rx, ry } = a.composite;
    parts.push({ minX: c.x - rx, minY: c.y - ry, maxX: c.x + rx, maxY: c.y + ry });
    for (const p of a.composite.parts) parts.push(labelBounds(p.geom, p.text));
  }
  for (const l of links) {
    parts.push({ minX: l.card.x - 20, minY: l.card.y - 10, maxX: l.card.x + 20, maxY: l.card.y + 10 });
    for (const pt of l.points) parts.push({ minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y });
    if (l.role) {
      const w = l.role.length * 7.5;
      const x0 = l.roleAnchor === 'start' ? l.rolePos.x : l.roleAnchor === 'end' ? l.rolePos.x - w : l.rolePos.x - w / 2;
      parts.push({ minX: x0, minY: l.rolePos.y - 12, maxX: x0 + w, maxY: l.rolePos.y + 4 });
    }
  }
  return { entities, relationships, attributes, links, isas, idBars, bounds: unionBounds(parts) };
}

const BAR_GAP = ATTR_STICK / 2;

function insideBox(b: Box, p: Point): boolean {
  return Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.y - b.y) < b.h / 2;
}

function crossesBox(b: Box, p: Point, q: Point): boolean {
  for (let t = 0; t <= 1; t += 0.05) if (insideBox(b, { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })) return true;
  return false;
}

/** Collega i punti della barra girando attorno agli angoli dell'entita' invece di attraversarla. */
function routeAround(b: Box, pts: Point[]): Point[] {
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: b.x + sx * (b.w / 2 + BAR_GAP), y: b.y + sy * (b.h / 2 + BAR_GAP) })));
  const out: Point[] = pts.length ? [pts[0]] : [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    if (crossesBox(b, p, q)) {
      const one = corners.find((c) => !crossesBox(b, p, c) && !crossesBox(b, c, q));
      if (one) out.push(one);
      else {
        const two = corners.flatMap((c1) => corners.map((c2) => [c1, c2])).find(([c1, c2]) =>
          c1 !== c2 && !crossesBox(b, p, c1) && !crossesBox(b, c1, c2) && !crossesBox(b, c2, q));
        if (two) out.push(...two);
      }
    }
    out.push(q);
  }
  return out;
}

function kindLabel(r: Relationship): string | undefined {
  if (r.participants.length !== 2) return undefined;
  const maxes = r.participants.map((p) => p.max);
  if (maxes.some((m) => m === null)) return undefined;
  const many = maxes.filter((m) => m !== 1).length;
  return many === 0 ? '1:1' : many === 1 ? '1:N' : 'N:N';
}

/** Limiti per l'export: tutto quello che si disegna, rami a gomito, cardinalita' e ruoli compresi. */
export function sceneExportBounds(d: Diagram): Bounds | null {
  return buildScene(d, [], new Set()).bounds;
}

export function elementBounds(s: Scene, ids: Iterable<Id>): Bounds | null {
  const set = new Set(ids);
  const parts: Bounds[] = [];
  for (const v of [...s.entities, ...s.relationships]) if (set.has(v.id)) parts.push(boxBounds(v.box));
  for (const a of s.attributes) if (set.has(a.id)) parts.push(labelBounds(a.geom, a.text));
  for (const i of s.isas) {
    if (!set.has(i.id)) continue;
    for (const [p, q] of i.geom.lines) parts.push({ minX: Math.min(p.x, q.x), minY: Math.min(p.y, q.y), maxX: Math.max(p.x, q.x), maxY: Math.max(p.y, q.y) });
  }
  return unionBounds(parts);
}
