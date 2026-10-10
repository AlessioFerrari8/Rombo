import { Bounds } from './geometry';
import { Id, LTable, LogicalDiagram, Point } from './model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HEADER_H = 34;
export const ROW_H = 26;
const MIN_W = 176;
const SNAP = 16;
const GAP = 24;

/** x, y = angolo alto-sinistra. La larghezza segue il nome della tabella e la riga piu' larga. */
export function tableRect(t: LTable): Rect {
  const head = t.name.length * 9.5 + 40;
  const rows = t.columns.map((c) => 34 + c.name.length * 7.5 + 20 + c.type.length * 6.5 + 14);
  const w = Math.ceil(Math.max(MIN_W, head, ...rows) / SNAP) * SNAP;
  return { x: t.pos.x, y: t.pos.y, w, h: HEADER_H + Math.max(1, t.columns.length) * ROW_H + 6 };
}

export function rowY(t: LTable, index: number): number {
  return t.pos.y + HEADER_H + index * ROW_H + ROW_H / 2;
}

export interface FkEdge {
  id: Id;
  tableId: Id;
  refTableId: Id;
  /** Poligonale ortogonale dalla colonna della FK alla colonna riferita. */
  points: Point[];
  /** Punta (in cima), poi i due angoli della base. */
  arrow: Point[];
}

export function fkEdges(l: LogicalDiagram): FkEdge[] {
  const byId = new Map(l.tables.map((t) => [t.id, t]));
  const out: FkEdge[] = [];
  for (const t of l.tables) {
    for (const fk of t.foreignKeys) {
      const r = byId.get(fk.refTableId);
      if (!r) continue;
      const a = tableRect(t);
      const b = tableRect(r);
      const si = Math.max(0, t.columns.findIndex((c) => c.id === fk.columnIds[0]));
      const ri = r.columns.findIndex((c) => c.id === fk.refColumnIds[0]);
      const sy = rowY(t, si);
      const ey = ri < 0 ? b.y + HEADER_H / 2 : rowY(r, ri);
      let points: Point[];
      let into: 1 | -1;
      if (a.x + a.w + GAP <= b.x) {
        const mx = (a.x + a.w + b.x) / 2;
        points = [{ x: a.x + a.w, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: b.x, y: ey }];
        into = 1;
      } else if (b.x + b.w + GAP <= a.x) {
        const mx = (b.x + b.w + a.x) / 2;
        points = [{ x: a.x, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: b.x + b.w, y: ey }];
        into = -1;
      } else {
        const ox = Math.max(a.x + a.w, b.x + b.w) + 32;
        points = [{ x: a.x + a.w, y: sy }, { x: ox, y: sy }, { x: ox, y: ey }, { x: b.x + b.w, y: ey }];
        into = -1;
      }
      const tip = points[points.length - 1];
      const base = tip.x - into * 10;
      out.push({
        id: fk.id, tableId: t.id, refTableId: r.id, points,
        arrow: [tip, { x: base, y: tip.y - 5 }, { x: base, y: tip.y + 5 }],
      });
    }
  }
  return out;
}

export function logicalBounds(l: LogicalDiagram): Bounds | null {
  if (!l.tables.length) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of l.tables) {
    const r = tableRect(t);
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  }
  for (const e of fkEdges(l)) for (const p of e.points) {
    xs.push(p.x);
    ys.push(p.y);
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function tableAt(l: LogicalDiagram, p: Point): LTable | undefined {
  return [...l.tables].reverse().find((t) => {
    const r = tableRect(t);
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  });
}
