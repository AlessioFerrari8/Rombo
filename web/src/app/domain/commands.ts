import { newId } from './ids';
import {
  AttrCard, Attribute, AttributePart, Diagram, Entity, Generalization, Id, Participant, Point, Relationship,
  entityById, findAttribute, findPart, relationshipById,
} from './model';
import { Box, REL_H, entityBox, overlaps, relBox } from './geometry';
import { connectedAngles, freeAngle } from './placement';

export interface Created {
  diagram: Diagram;
  id: Id;
}

export interface Clipboard {
  entities: Entity[];
  relationships: Relationship[];
  generalizations: Generalization[];
}

/** Ogni comando lavora su una copia: il diagramma di partenza resta intatto (serve all'undo). */
export function edit(d: Diagram, fn: (draft: Diagram) => void): Diagram {
  const draft = structuredClone(d);
  fn(draft);
  return draft;
}

export function uniqueName(taken: Iterable<string>, base: string): string {
  const set = new Set([...taken].map((n) => n.trim().toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}

function elementNames(d: Diagram): string[] {
  return [...d.entities.map((e) => e.name), ...d.relationships.map((r) => r.name)];
}

function centroid(points: Point[]): Point {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

export function createDiagram(title = 'Nuovo diagramma'): Diagram {
  return { version: 1, id: newId(), title, entities: [], relationships: [], generalizations: [] };
}

export function setTitle(d: Diagram, title: string): Diagram {
  return edit(d, (x) => {
    x.title = title.trim().slice(0, 120) || 'Senza titolo';
  });
}

export function addEntity(d: Diagram, pos: Point, name?: string): Created {
  const id = newId();
  const diagram = edit(d, (x) => {
    x.entities.push({
      id,
      name: name ?? uniqueName(elementNames(x), 'Entità'),
      pos: { ...pos },
      attributes: [],
      primary: null,
      alternates: [],
    });
  });
  return { diagram, id };
}

/**
 * Dove mettere il rombo di un'associazione nuova: fra le entita', spostandosi di lato finche'
 * non tocca niente (due associazioni fra le stesse entita', o una ricorsiva vicino a un'altra entita').
 */
function freeRelationshipSpot(d: Diagram, points: Point[], name: string): Point {
  const base = centroid(points);
  const self = points.every((p) => p.x === points[0].x && p.y === points[0].y);
  const ents: Box[] = d.entities.map(entityBox);
  const rels: Box[] = d.relationships.map(relBox);
  const free = (c: Point) => {
    const box = relBox({ pos: c, name });
    return !ents.some((b) => overlaps(box, b)) && !rels.some((b) => overlaps(box, b, 16));
  };
  const candidates: Point[] = [];
  if (self) {
    for (let k = 1; k <= 6; k++) {
      const r = 180 * k;
      candidates.push({ x: base.x + r, y: base.y }, { x: base.x - r, y: base.y }, { x: base.x, y: base.y + r * 0.8 }, { x: base.x, y: base.y - r * 0.8 });
    }
  } else {
    // di lato rispetto alla linea fra le prime due entita'
    const [a, b] = points;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const perp = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const step = REL_H + 24;
    candidates.push(base);
    for (let k = 1; k <= 8; k++) {
      for (const sgn of [1, -1]) candidates.push({ x: base.x + perp.x * step * k * sgn, y: base.y + perp.y * step * k * sgn });
    }
  }
  return candidates.find(free) ?? candidates[0];
}

export function addRelationship(d: Diagram, entityIds: Id[], pos?: Point, name?: string): Created {
  if (entityIds.length < 2 || entityIds.length > 4) {
    throw new Error("Un'associazione collega da 2 a 4 entità");
  }
  const ents = entityIds.map((id) => {
    const e = entityById(d, id);
    if (!e) throw new Error(`Entità ${id} inesistente`);
    return e;
  });
  const relName = name ?? uniqueName(elementNames(d), 'Associazione');
  const center = pos ?? freeRelationshipSpot(d, ents.map((e) => e.pos), relName);
  const id = newId();
  const diagram = edit(d, (x) => {
    x.relationships.push({
      id,
      name: relName,
      pos: center,
      participants: entityIds.map((entityId) => ({ entityId, min: null, max: null })),
      attributes: [],
    });
  });
  return { diagram, id };
}

export function addAttribute(d: Diagram, ownerId: Id, name?: string, card: AttrCard = '1,1'): Created {
  const id = newId();
  const diagram = edit(d, (x) => {
    const owner = entityById(x, ownerId) ?? relationshipById(x, ownerId);
    if (!owner) throw new Error(`Elemento ${ownerId} inesistente`);
    const angle = freeAngle([...owner.attributes.map((a) => a.angle), ...connectedAngles(x, ownerId)]);
    owner.attributes.push({
      id,
      name: name ?? uniqueName(owner.attributes.map((a) => a.name), 'attributo'),
      card,
      angle,
    });
  });
  return { diagram, id };
}

export function rename(d: Diagram, id: Id, name: string): Diagram {
  return edit(d, (x) => {
    const target = entityById(x, id) ?? relationshipById(x, id) ?? findAttribute(x, id)?.attribute ?? findPart(x, id)?.part;
    if (!target) throw new Error(`Elemento ${id} inesistente`);
    target.name = name.trim();
  });
}

export function moveElements(d: Diagram, ids: Iterable<Id>, dx: number, dy: number): Diagram {
  const set = new Set(ids);
  return edit(d, (x) => {
    for (const el of [...x.entities, ...x.relationships]) {
      if (set.has(el.id)) el.pos = { x: el.pos.x + dx, y: el.pos.y + dy };
    }
  });
}

export function setPositions(d: Diagram, positions: Record<Id, Point>): Diagram {
  return edit(d, (x) => {
    for (const el of [...x.entities, ...x.relationships]) {
      const p = positions[el.id];
      if (p) el.pos = { x: p.x, y: p.y };
    }
  });
}

export function updateAttribute(
  d: Diagram,
  attrId: Id,
  patch: Partial<Pick<Attribute, 'name' | 'card' | 'type' | 'angle'>>,
): Diagram {
  return edit(d, (x) => {
    const found = findAttribute(x, attrId);
    if (!found) throw new Error(`Attributo ${attrId} inesistente`);
    const a = found.attribute;
    if (patch.name !== undefined) a.name = patch.name.trim();
    if (patch.card !== undefined) a.card = patch.card;
    if (patch.angle !== undefined) a.angle = patch.angle;
    if (patch.type !== undefined) {
      if (patch.type === '') delete a.type;
      else a.type = patch.type;
    }
  });
}

/** Aggiunge una parte: l'attributo diventa composto (o ne guadagna un'altra). */
export function addAttributePart(d: Diagram, attrId: Id, name?: string): Created {
  const id = newId();
  const diagram = edit(d, (x) => {
    const found = findAttribute(x, attrId);
    if (!found) throw new Error(`Attributo ${attrId} inesistente`);
    const parts = (found.attribute.parts ??= []);
    parts.push({ id, name: name ?? uniqueName(parts.map((p) => p.name), 'parte'), card: '1,1' });
  });
  return { diagram, id };
}

export function updatePart(d: Diagram, partId: Id, patch: Partial<Pick<AttributePart, 'name' | 'card' | 'type'>>): Diagram {
  return edit(d, (x) => {
    const found = findPart(x, partId);
    if (!found) throw new Error(`Parte ${partId} inesistente`);
    const p = found.part;
    if (patch.name !== undefined) p.name = patch.name.trim();
    if (patch.card !== undefined) p.card = patch.card;
    if (patch.type !== undefined) {
      if (patch.type === '') delete p.type;
      else p.type = patch.type;
    }
  });
}

function mutableEntity(x: Diagram, entityId: Id): Entity {
  const e = entityById(x, entityId);
  if (!e) throw new Error(`Entità ${entityId} inesistente`);
  return e;
}

function normalizePrimary(e: Entity): void {
  if (e.primary && !e.primary.attributeIds.length && !e.primary.externalVia.length) e.primary = null;
}

export function toggleIdentifierAttribute(d: Diagram, entityId: Id, attrId: Id): Diagram {
  return edit(d, (x) => {
    const e = mutableEntity(x, entityId);
    if (!e.attributes.some((a) => a.id === attrId)) throw new Error("L'attributo non è di questa entità");
    const p = e.primary ?? { attributeIds: [], externalVia: [] };
    p.attributeIds = p.attributeIds.includes(attrId)
      ? p.attributeIds.filter((a) => a !== attrId)
      : [...p.attributeIds, attrId];
    e.primary = p;
    normalizePrimary(e);
  });
}

export function setExternalVia(d: Diagram, entityId: Id, relIds: Id[]): Diagram {
  return edit(d, (x) => {
    const e = mutableEntity(x, entityId);
    const p = e.primary ?? { attributeIds: [], externalVia: [] };
    p.externalVia = [...new Set(relIds)];
    e.primary = p;
    normalizePrimary(e);
  });
}

export function setAlternates(d: Diagram, entityId: Id, sets: Id[][]): Diagram {
  return edit(d, (x) => {
    const e = mutableEntity(x, entityId);
    e.alternates = sets.map((s) => [...new Set(s)]).filter((s) => s.length);
  });
}

export function updateParticipant(
  d: Diagram,
  relId: Id,
  index: number,
  patch: Partial<Omit<Participant, 'entityId'>>,
): Diagram {
  return edit(d, (x) => {
    const r = relationshipById(x, relId);
    const p = r?.participants[index];
    if (!p) throw new Error(`Partecipante ${index} di ${relId} inesistente`);
    if (patch.min !== undefined) p.min = patch.min;
    if (patch.max !== undefined) p.max = patch.max;
    if (patch.role !== undefined) {
      const role = patch.role.trim();
      if (role) p.role = role;
      else delete p.role;
    }
  });
}

export function setFkOn(d: Diagram, relId: Id, entityId?: Id): Diagram {
  return edit(d, (x) => {
    const r = relationshipById(x, relId);
    if (!r) throw new Error(`Associazione ${relId} inesistente`);
    if (entityId) r.fkOn = entityId;
    else delete r.fkOn;
  });
}

export function addGeneralization(d: Diagram, parentId: Id, childIds: Id[]): Created {
  if (!childIds.length) throw new Error('Una generalizzazione ha almeno un figlio');
  if (childIds.includes(parentId)) throw new Error("Un'entità non può essere figlia di se stessa");
  for (const id of [parentId, ...childIds]) {
    if (!entityById(d, id)) throw new Error(`Entità ${id} inesistente`);
  }
  const id = newId();
  const diagram = edit(d, (x) => {
    x.generalizations.push({ id, parentId, childIds: [...new Set(childIds)], total: false, exclusive: true });
  });
  return { diagram, id };
}

export function updateGeneralization(
  d: Diagram,
  id: Id,
  patch: Partial<Pick<Generalization, 'total' | 'exclusive' | 'strategy' | 'childIds'>>,
): Diagram {
  return edit(d, (x) => {
    const g = x.generalizations.find((it) => it.id === id);
    if (!g) throw new Error(`Generalizzazione ${id} inesistente`);
    if (patch.total !== undefined) g.total = patch.total;
    if (patch.exclusive !== undefined) g.exclusive = patch.exclusive;
    if (patch.childIds !== undefined) g.childIds = [...new Set(patch.childIds)].filter((c) => c !== g.parentId);
    if ('strategy' in patch) {
      if (patch.strategy) g.strategy = patch.strategy;
      else delete g.strategy;
    }
  });
}

/** Cancella e ripulisce a cascata: nessun riferimento resta appeso. */
export function deleteElements(d: Diagram, ids: Iterable<Id>): Diagram {
  const gone = new Set(ids);
  return edit(d, (x) => {
    for (const owner of [...x.entities, ...x.relationships]) {
      owner.attributes = owner.attributes.filter((a) => !gone.has(a.id));
      for (const a of owner.attributes) {
        if (!a.parts) continue;
        a.parts = a.parts.filter((p) => !gone.has(p.id));
        if (!a.parts.length) delete a.parts;
      }
    }
    x.entities = x.entities.filter((e) => !gone.has(e.id));
    const alive = new Set(x.entities.map((e) => e.id));
    for (const r of x.relationships) {
      r.participants = r.participants.filter((p) => alive.has(p.entityId));
      if (r.participants.length < 2) gone.add(r.id);
      if (r.fkOn && !alive.has(r.fkOn)) delete r.fkOn;
    }
    x.relationships = x.relationships.filter((r) => !gone.has(r.id));
    const aliveRels = new Set(x.relationships.map((r) => r.id));
    for (const g of x.generalizations) g.childIds = g.childIds.filter((c) => alive.has(c));
    x.generalizations = x.generalizations.filter(
      (g) => !gone.has(g.id) && alive.has(g.parentId) && g.childIds.length > 0,
    );
    for (const e of x.entities) {
      const attrIds = new Set(e.attributes.map((a) => a.id));
      if (e.primary) {
        e.primary.attributeIds = e.primary.attributeIds.filter((a) => attrIds.has(a));
        e.primary.externalVia = e.primary.externalVia.filter((r) => aliveRels.has(r));
        normalizePrimary(e);
      }
      e.alternates = e.alternates.map((s) => s.filter((a) => attrIds.has(a))).filter((s) => s.length);
    }
  });
}

export function copyElements(d: Diagram, ids: Iterable<Id>): Clipboard {
  const sel = new Set(ids);
  const entities = d.entities.filter((e) => sel.has(e.id));
  const eids = new Set(entities.map((e) => e.id));
  const relationships = d.relationships.filter((r) => r.participants.every((p) => eids.has(p.entityId)));
  const generalizations = d.generalizations
    .filter((g) => eids.has(g.parentId) && g.childIds.some((c) => eids.has(c)))
    .map((g) => ({ ...g, childIds: g.childIds.filter((c) => eids.has(c)) }));
  return structuredClone({ entities, relationships, generalizations });
}

/** Rimette gli attributi nelle direzioni libere (dopo un layout automatico). */
export function redistributeAttributes(d: Diagram, ownerIds?: Iterable<Id>): Diagram {
  const only = ownerIds ? new Set(ownerIds) : null;
  return edit(d, (x) => {
    for (const owner of [...x.entities, ...x.relationships]) {
      if (only && !only.has(owner.id)) continue;
      const taken = connectedAngles(x, owner.id);
      for (const a of owner.attributes) {
        a.angle = freeAngle(taken);
        taken.push(a.angle);
      }
    }
  });
}

export function pasteElements(
  d: Diagram,
  clip: Clipboard,
  offset: Point = { x: 32, y: 32 },
): { diagram: Diagram; ids: Id[] } {
  const map = new Map<Id, Id>();
  const fresh = (old: Id): Id => {
    const n = newId();
    map.set(old, n);
    return n;
  };
  const out = structuredClone(clip);
  const ids: Id[] = [];
  const diagram = edit(d, (x) => {
    const names = elementNames(x);
    for (const e of out.entities) {
      e.id = fresh(e.id);
      e.name = uniqueName(names, e.name);
      names.push(e.name);
      e.pos = { x: e.pos.x + offset.x, y: e.pos.y + offset.y };
      for (const a of e.attributes) {
        a.id = fresh(a.id);
        for (const p of a.parts ?? []) p.id = fresh(p.id);
      }
    }
    for (const r of out.relationships) {
      r.id = fresh(r.id);
      r.name = uniqueName(names, r.name);
      names.push(r.name);
      r.pos = { x: r.pos.x + offset.x, y: r.pos.y + offset.y };
      for (const a of r.attributes) {
        a.id = fresh(a.id);
        for (const p of a.parts ?? []) p.id = fresh(p.id);
      }
      r.participants = r.participants.map((p) => ({ ...p, entityId: map.get(p.entityId)! }));
      const fk = r.fkOn ? map.get(r.fkOn) : undefined;
      if (fk) r.fkOn = fk;
      else delete r.fkOn;
    }
    for (const e of out.entities) {
      if (e.primary) {
        e.primary = {
          attributeIds: e.primary.attributeIds.map((a) => map.get(a)!).filter(Boolean),
          externalVia: e.primary.externalVia.filter((r) => map.has(r)).map((r) => map.get(r)!),
        };
        normalizePrimary(e);
      }
      e.alternates = e.alternates.map((s) => s.map((a) => map.get(a)!).filter(Boolean));
    }
    for (const g of out.generalizations) {
      g.id = fresh(g.id);
      g.parentId = map.get(g.parentId)!;
      g.childIds = g.childIds.map((c) => map.get(c)!);
    }
    x.entities.push(...out.entities);
    x.relationships.push(...out.relationships);
    x.generalizations.push(...out.generalizations);
    ids.push(...out.entities.map((e) => e.id), ...out.relationships.map((r) => r.id), ...out.generalizations.map((g) => g.id));
  });
  return { diagram, ids };
}
