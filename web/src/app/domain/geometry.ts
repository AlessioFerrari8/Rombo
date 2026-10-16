import { Attribute, Diagram, Entity, Point, Relationship } from './model';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const ENTITY_H = 56;
export const REL_H = 64;
export const ATTR_STICK = 26;
export const GRID = 16;
const CHAR_W = 9.5;
const LABEL_CHAR_W = 7.5;

export function entityBox(e: Pick<Entity, 'pos' | 'name'>): Box {
  return { x: e.pos.x, y: e.pos.y, w: Math.max(120, Math.ceil(e.name.length * CHAR_W) + 40), h: ENTITY_H };
}

export function relBox(r: Pick<Relationship, 'pos' | 'name'>): Box {
  return { x: r.pos.x, y: r.pos.y, w: Math.max(100, Math.ceil(r.name.length * CHAR_W) + 64), h: REL_H };
}

export function rectBorder(b: Box, angle: number): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = Math.abs(dx) > 1e-9 ? b.w / 2 / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-9 ? b.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: b.x + dx * t, y: b.y + dy * t };
}

export function rhombusBorder(b: Box, angle: number): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const t = 1 / (Math.abs(dx) / (b.w / 2) + Math.abs(dy) / (b.h / 2));
  return { x: b.x + dx * t, y: b.y + dy * t };
}

export function rhombusPoints(b: Box, grow = 0): string {
  const w = b.w / 2 + grow;
  const h = b.h / 2 + grow;
  return `${b.x},${b.y - h} ${b.x + w},${b.y} ${b.x},${b.y + h} ${b.x - w},${b.y}`;
}

export interface AttrGeom {
  from: Point;
  dot: Point;
  label: Point;
  anchor: 'start' | 'end' | 'middle';
}

export function attributeGeometry(owner: Box, shape: 'rect' | 'rhombus', angle: number): AttrGeom {
  const from = shape === 'rect' ? rectBorder(owner, angle) : rhombusBorder(owner, angle);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = { x: from.x + c * ATTR_STICK, y: from.y + s * ATTR_STICK };
  if (Math.abs(c) < 0.35) {
    return { from, dot, label: { x: dot.x, y: dot.y + (s < 0 ? -12 : 20) }, anchor: 'middle' };
  }
  return { from, dot, label: { x: dot.x + (c > 0 ? 10 : -10), y: dot.y + 4 }, anchor: c > 0 ? 'start' : 'end' };
}

export interface CompositeGeom {
  /** Asta dal proprietario all'ovale. */
  from: Point;
  stickEnd: Point;
  center: Point;
  rx: number;
  ry: number;
  /** Le parti, a ventaglio oltre l'ovale. */
  parts: AttrGeom[];
}

function ellipseReach(rx: number, ry: number, c: number, s: number): number {
  return 1 / Math.sqrt((c / rx) ** 2 + (s / ry) ** 2);
}

function labelFor(dot: Point, c: number, s: number): Pick<AttrGeom, 'label' | 'anchor'> {
  if (Math.abs(c) < 0.35) return { label: { x: dot.x, y: dot.y + (s < 0 ? -12 : 20) }, anchor: 'middle' };
  return { label: { x: dot.x + (c > 0 ? 10 : -10), y: dot.y + 4 }, anchor: c > 0 ? 'start' : 'end' };
}

/** Attributo composto (slide «Attributi composti»): asta, ovale col nome, parti a ventaglio. */
export function compositeGeometry(owner: Box, shape: 'rect' | 'rhombus', angle: number, name: string, parts: number): CompositeGeom {
  const from = shape === 'rect' ? rectBorder(owner, angle) : rhombusBorder(owner, angle);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = Math.max(30, Math.ceil(name.length * LABEL_CHAR_W) / 2 + 12);
  const ry = 13;
  const reach = ellipseReach(rx, ry, c, s);
  const stickEnd = { x: from.x + c * ATTR_STICK, y: from.y + s * ATTR_STICK };
  const center = { x: stickEnd.x + c * reach, y: stickEnd.y + s * reach };
  const spread = parts > 1 ? Math.min(0.55, 1.6 / (parts - 1)) : 0;
  const geoms: AttrGeom[] = [];
  for (let k = 0; k < parts; k++) {
    const a = angle + (k - (parts - 1) / 2) * spread;
    const pc = Math.cos(a);
    const ps = Math.sin(a);
    const r = ellipseReach(rx, ry, pc, ps);
    const pf = { x: center.x + pc * r, y: center.y + ps * r };
    const dot = { x: pf.x + pc * (ATTR_STICK + 6), y: pf.y + ps * (ATTR_STICK + 6) };
    geoms.push({ from: pf, dot, ...labelFor(dot, pc, ps) });
  }
  // ordine di lettura: dall'alto in basso se il ventaglio e' di lato, da sinistra a destra se sopra o sotto
  geoms.sort((a, b) => (Math.abs(c) >= Math.abs(s) ? a.dot.y - b.dot.y : a.dot.x - b.dot.x));
  return { from, stickEnd, center, rx, ry, parts: geoms };
}

export interface LinkGeom {
  from: Point;
  to: Point;
  /** Percorso della linea dal rombo all'entita': due punti se dritta, di piu' se a gomito. */
  points: Point[];
  card: Point;
  mid: Point;
  /** Allineamento dell'etichetta del ruolo (di lato sui rami verticali). */
  roleAnchor?: 'start' | 'end' | 'middle';
}

export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
}

/**
 * Associazione ricorsiva (slide «Relazioni unarie»): due rami a gomito che partono da vertici
 * opposti del rombo e arrivano su due lati opposti dell'entita', senza mai sovrapporsi.
 */
export function selfLoopGeometry(rel: Box, ent: Box): [LinkGeom, LinkGeom] {
  const M = 28;
  const dx = rel.x - ent.x;
  const dy = rel.y - ent.y;
  const leg = (points: Point[], card: Point, mid: Point, roleAnchor: LinkGeom['roleAnchor'] = 'middle'): LinkGeom =>
    ({ from: points[0], to: points[points.length - 1], points, card, mid, roleAnchor });
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = Math.sign(dx) || 1;
    const ex = ent.x + (sx * ent.w) / 4;
    const top = Math.min(ent.y - ent.h / 2, rel.y - rel.h / 2) - M;
    const bottom = Math.max(ent.y + ent.h / 2, rel.y + rel.h / 2) + M;
    const midX = (ex + rel.x) / 2;
    return [
      leg([{ x: rel.x, y: rel.y - rel.h / 2 }, { x: rel.x, y: top }, { x: ex, y: top }, { x: ex, y: ent.y - ent.h / 2 }],
        { x: ex - sx * 24, y: ent.y - ent.h / 2 - 12 }, { x: midX, y: top - 8 }),
      leg([{ x: rel.x, y: rel.y + rel.h / 2 }, { x: rel.x, y: bottom }, { x: ex, y: bottom }, { x: ex, y: ent.y + ent.h / 2 }],
        { x: ex - sx * 24, y: ent.y + ent.h / 2 + 14 }, { x: midX, y: bottom + 16 }),
    ];
  }
  const sy = Math.sign(dy) || 1;
  const ey = ent.y + (sy * ent.h) / 4;
  const left = Math.min(ent.x - ent.w / 2, rel.x - rel.w / 2) - M;
  const right = Math.max(ent.x + ent.w / 2, rel.x + rel.w / 2) + M;
  const midY = (ey + rel.y) / 2;
  return [
    leg([{ x: rel.x - rel.w / 2, y: rel.y }, { x: left, y: rel.y }, { x: left, y: ey }, { x: ent.x - ent.w / 2, y: ey }],
      { x: ent.x - ent.w / 2 - 24, y: ey - sy * 14 }, { x: left - 8, y: midY + 4 }, 'end'),
    leg([{ x: rel.x + rel.w / 2, y: rel.y }, { x: right, y: rel.y }, { x: right, y: ey }, { x: ent.x + ent.w / 2, y: ey }],
      { x: ent.x + ent.w / 2 + 24, y: ey - sy * 14 }, { x: right + 8, y: midY + 4 }, 'start'),
  ];
}

/** Margine dagli angoli arrotondati (rx=10) del rettangolo: una linea dritta non ci arriva mai. */
const CORNER_MARGIN = 12;
/** Mezza larghezza/altezza indicative di «(1,N)»: la cardinalita' non deve toccare la linea. */
const CARD_HALF_W = 16;
const CARD_HALF_H = 8;

/**
 * Linea rombo → entita': sempre un segmento solo. Se il rombo e' (quasi) in colonna o in riga con
 * l'entita' la linea e' perfettamente verticale/orizzontale e parte dal vertice del rombo; altrimenti
 * segue la retta centro-centro. `spread` apre a ventaglio le linee verso la stessa entita';
 * `clearAlong` e' un tratto della linea, dal bordo dell'entita', che la cardinalita' deve lasciare libero
 * (li' attraversa la barra di un identificatore esterno).
 */
export function participantGeometry(rel: Box, ent: Box, spread = 0, clearAlong = 0): LinkGeom {
  let from: Point;
  let to: Point;
  const vGap = Math.abs(ent.y - rel.y) - (ent.h + rel.h) / 2;
  const hGap = Math.abs(ent.x - rel.x) - (ent.w + rel.w) / 2;
  if (!spread && vGap > 0 && Math.abs(rel.x - ent.x) <= ent.w / 2 - CORNER_MARGIN) {
    const sy = Math.sign(ent.y - rel.y);
    from = { x: rel.x, y: rel.y + (sy * rel.h) / 2 };
    to = { x: rel.x, y: ent.y - (sy * ent.h) / 2 };
  } else if (!spread && hGap > 0 && Math.abs(rel.y - ent.y) <= ent.h / 2 - CORNER_MARGIN) {
    const sx = Math.sign(ent.x - rel.x);
    from = { x: rel.x + (sx * rel.w) / 2, y: rel.y };
    to = { x: ent.x - (sx * ent.w) / 2, y: rel.y };
  } else {
    const a = Math.atan2(ent.y - rel.y, ent.x - rel.x) + spread;
    from = rhombusBorder(rel, a);
    to = rectBorder(ent, Math.atan2(from.y - ent.y, from.x - ent.x) + spread * 0.6);
  }
  const len = Math.hypot(from.x - to.x, from.y - to.y) || 1;
  const ux = (from.x - to.x) / len;
  const uy = (from.y - to.y) / len;
  // distanza dalla linea che basta a non toccarla con un'etichetta larga CARD_HALF_W*2
  const off = CARD_HALF_W * Math.abs(uy) + CARD_HALF_H * Math.abs(ux) + 4;
  const along = clearAlong ? Math.max(22, clearAlong + CARD_HALF_W * Math.abs(ux) + CARD_HALF_H * Math.abs(uy) + 6) : 22;
  return {
    from,
    to,
    points: [from, to],
    card: { x: to.x + ux * along - uy * off, y: to.y + uy * along + ux * off },
    mid: { x: (from.x + to.x) / 2 - uy * 12, y: (from.y + to.y) / 2 + ux * 12 },
  };
}

/** Raddrizza un angolo a pochi gradi da orizzontale/verticale: le aste degli attributi non escono storte. */
export function snapAngle(angle: number, tolerance = 0.1): number {
  const q = Math.PI / 2;
  const k = Math.round(angle / q);
  return Math.abs(angle - k * q) <= tolerance ? k * q : angle;
}

export interface IsaGeom {
  lines: Array<[Point, Point]>;
  arrow: { tip: Point; left: Point; right: Point };
  label: Point;
}

/**
 * IS-A come nel libro: freccia vuota con la punta sul bordo del padre, un gambo fino a una barra
 * e da li' un ramo dritto verso ogni figlio. Tutti i segmenti sono orizzontali o verticali.
 */
export function generalizationGeometry(parent: Box, children: Box[]): IsaGeom {
  const cy = children.reduce((s, c) => s + c.y, 0) / children.length;
  const dir = Math.sign(cy - parent.y) || 1;
  const H = 24;
  const W = 44;
  const tip = { x: parent.x, y: parent.y + (dir * parent.h) / 2 };
  const baseY = tip.y + dir * H;
  const nearest = dir > 0 ? Math.min(...children.map((c) => c.y - c.h / 2)) : Math.max(...children.map((c) => c.y + c.h / 2));
  const barY = dir > 0 ? Math.max(baseY + 12, (baseY + nearest) / 2) : Math.min(baseY - 12, (baseY + nearest) / 2);
  const xs = [parent.x, ...children.map((c) => c.x)];
  const lines: Array<[Point, Point]> = ([
    [{ x: parent.x, y: baseY }, { x: parent.x, y: barY }],
    [{ x: Math.min(...xs), y: barY }, { x: Math.max(...xs), y: barY }],
    ...children.map((c): [Point, Point] => [{ x: c.x, y: barY }, { x: c.x, y: c.y - (dir * c.h) / 2 }]),
  ] as Array<[Point, Point]>).filter(([a, b]) => a.x !== b.x || a.y !== b.y);
  return {
    lines,
    arrow: { tip, left: { x: parent.x - W, y: baseY }, right: { x: parent.x + W, y: baseY } },
    label: { x: parent.x + W + 8, y: baseY - dir * 6 },
  };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  return {
    minX: Math.min(...list.map((b) => b.minX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  };
}

export function boxBounds(b: Box): Bounds {
  return { minX: b.x - b.w / 2, minY: b.y - b.h / 2, maxX: b.x + b.w / 2, maxY: b.y + b.h / 2 };
}

export function labelBounds(g: AttrGeom, text: string): Bounds {
  const w = text.length * LABEL_CHAR_W;
  const x0 = g.anchor === 'start' ? g.label.x : g.anchor === 'end' ? g.label.x - w : g.label.x - w / 2;
  return {
    minX: Math.min(x0, g.dot.x - 6),
    minY: Math.min(g.label.y - 14, g.dot.y - 6),
    maxX: Math.max(x0 + w, g.dot.x + 6),
    maxY: Math.max(g.label.y + 4, g.dot.y + 6),
  };
}

function attrBounds(b: Box, shape: 'rect' | 'rhombus', a: Attribute): Bounds[] {
  if (!a.parts?.length) return [labelBounds(attributeGeometry(b, shape, a.angle), a.name)];
  const g = compositeGeometry(b, shape, a.angle, a.name, a.parts.length);
  return [
    { minX: g.center.x - g.rx, minY: g.center.y - g.ry, maxX: g.center.x + g.rx, maxY: g.center.y + g.ry },
    ...g.parts.map((pg, i) => labelBounds(pg, a.parts![i].name)),
  ];
}

export function diagramBounds(d: Diagram): Bounds | null {
  const parts: Bounds[] = [];
  for (const e of d.entities) {
    const b = entityBox(e);
    parts.push(boxBounds(b));
    for (const a of e.attributes) parts.push(...attrBounds(b, 'rect', a));
  }
  for (const r of d.relationships) {
    const b = relBox(r);
    parts.push(boxBounds(b));
    for (const a of r.attributes) parts.push(...attrBounds(b, 'rhombus', a));
  }
  return unionBounds(parts);
}
