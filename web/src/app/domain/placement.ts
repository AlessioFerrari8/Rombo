import { Diagram, Id, Point, entityById, relationshipById } from './model';

export function angDist(a: number, b: number): number {
  const tau = 2 * Math.PI;
  const d = (((a - b) % tau) + tau) % tau;
  return Math.min(d, tau - d);
}

export function directionAngle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** La direzione piu' lontana da quelle gia' occupate (24 candidate, a partire dall'alto). */
export function freeAngle(taken: number[]): number {
  const candidates = Array.from({ length: 24 }, (_, i) => -Math.PI / 2 + (i * Math.PI) / 12);
  if (!taken.length) return candidates[0];
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const score = Math.min(...taken.map((t) => angDist(c, t)));
    if (score > bestScore + 1e-9) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** Direzioni delle linee che escono da un'entita' o da un'associazione. */
export function connectedAngles(d: Diagram, ownerId: Id): number[] {
  const e = entityById(d, ownerId);
  if (e) {
    const out: number[] = [];
    for (const r of d.relationships) {
      if (r.participants.some((p) => p.entityId === ownerId)) out.push(directionAngle(e.pos, r.pos));
    }
    for (const g of d.generalizations) {
      if (g.parentId === ownerId) {
        for (const c of g.childIds) {
          const child = entityById(d, c);
          if (child) out.push(directionAngle(e.pos, child.pos));
        }
      }
      if (g.childIds.includes(ownerId)) {
        const parent = entityById(d, g.parentId);
        if (parent) out.push(directionAngle(e.pos, parent.pos));
      }
    }
    return out;
  }
  const r = relationshipById(d, ownerId);
  if (!r) return [];
  return r.participants
    .map((p) => entityById(d, p.entityId))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => directionAngle(r.pos, x.pos));
}
