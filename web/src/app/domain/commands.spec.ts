import {
  addAttribute, addEntity, addGeneralization, addRelationship, copyElements, createDiagram,
  deleteElements, moveElements, pasteElements, redistributeAttributes, rename, setExternalVia, setIdentifying, setWeak,
  toggleIdentifierAttribute, uniqueName, updateParticipant,
} from './commands';
import { Diagram, entityById, relationshipById } from './model';
import { angDist, connectedAngles } from './placement';
import { REL_H, entityBox, overlaps, relBox } from './geometry';

function base() {
  let d = createDiagram('Prova');
  const a = addEntity(d, { x: 0, y: 0 }, 'Auto'); d = a.diagram;
  const p = addEntity(d, { x: 300, y: 0 }, 'Proprietario'); d = p.diagram;
  const targa = addAttribute(d, a.id, 'Targa'); d = targa.diagram;
  const r = addRelationship(d, [p.id, a.id], undefined, 'possiede'); d = r.diagram;
  return { d, auto: a.id, prop: p.id, targa: targa.id, rel: r.id };
}

describe('comandi', () => {
  it('non modificano il diagramma di partenza', () => {
    const d0 = createDiagram();
    const { diagram } = addEntity(d0, { x: 1, y: 2 });
    expect(d0.entities).toHaveLength(0);
    expect(diagram.entities).toHaveLength(1);
  });

  it('danno nomi unici di default', () => {
    let d = createDiagram();
    d = addEntity(d, { x: 0, y: 0 }).diagram;
    d = addEntity(d, { x: 0, y: 0 }).diagram;
    expect(d.entities.map((e) => e.name)).toEqual(['Entità', 'Entità 2']);
    expect(uniqueName(['a', 'A 2'], 'a')).toBe('a 3');
  });

  it("l'associazione nasce fra le entita, senza cardinalita", () => {
    const { d, rel } = base();
    const r = relationshipById(d, rel)!;
    expect(r.pos).toEqual({ x: 150, y: 0 });
    expect(r.participants.map((p) => [p.min, p.max])).toEqual([[null, null], [null, null]]);
  });

  it("l'associazione ricorsiva non si sovrappone all'entita", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Dipendente'); d = e.diagram;
    const r = addRelationship(d, [e.id, e.id]);
    expect(relationshipById(r.diagram, r.id)!.pos).toEqual({ x: 180, y: 0 });
  });

  it('due associazioni fra le stesse entita non finiscono una sopra l\'altra', () => {
    let d = createDiagram();
    const a = addEntity(d, { x: 0, y: 0 }, 'Docente'); d = a.diagram;
    const b = addEntity(d, { x: 400, y: 0 }, 'Classe'); d = b.diagram;
    const r1 = addRelationship(d, [a.id, b.id], undefined, 'insegna'); d = r1.diagram;
    const r2 = addRelationship(d, [a.id, b.id], undefined, 'coordina'); d = r2.diagram;
    const p1 = relationshipById(d, r1.id)!.pos;
    const p2 = relationshipById(d, r2.id)!.pos;
    expect(Math.abs(p1.y - p2.y)).toBeGreaterThanOrEqual(REL_H + 16);
  });

  it("l'associazione ricorsiva non finisce sopra un'altra entita", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = e.diagram;
    const o = addEntity(d, { x: 180, y: 0 }, 'Prodotto'); d = o.diagram;
    const r = addRelationship(d, [e.id, e.id]); d = r.diagram;
    const rb = relBox(relationshipById(d, r.id)!);
    for (const ent of d.entities) expect(overlaps(rb, entityBox(ent))).toBe(false);
  });

  it('rifiuta associazioni con meno di 2 o piu di 4 entita', () => {
    const { d, auto } = base();
    expect(() => addRelationship(d, [auto])).toThrow();
    expect(() => addRelationship(d, [auto, auto, auto, auto, auto])).toThrow();
  });

  it("il click sul pallino mette e toglie l'attributo dall'identificatore", () => {
    const { d, auto, targa } = base();
    const on = toggleIdentifierAttribute(d, auto, targa);
    expect(entityById(on, auto)!.primary).toEqual({ attributeIds: [targa], externalVia: [] });
    const off = toggleIdentifierAttribute(on, auto, targa);
    expect(entityById(off, auto)!.primary).toBeNull();
  });

  it('rinomina entita, associazioni e attributi togliendo gli spazi ai lati', () => {
    const { d, targa, rel } = base();
    const d2 = rename(rename(d, targa, '  Numero targa '), rel, 'ha');
    expect(d2.entities[0].attributes[0].name).toBe('Numero targa');
    expect(d2.relationships[0].name).toBe('ha');
  });

  it('sposta solo gli elementi indicati', () => {
    const { d, auto, rel } = base();
    const d2 = moveElements(d, [auto, rel], 10, -5);
    expect(entityById(d2, auto)!.pos).toEqual({ x: 10, y: -5 });
    expect(relationshipById(d2, rel)!.pos).toEqual({ x: 160, y: -5 });
    expect(d2.entities[1].pos).toEqual({ x: 300, y: 0 });
  });

  it("cancellare un'entita toglie associazioni rimaste con un solo lato, IS-A e identificatori esterni", () => {
    let { d, auto, prop, rel } = base();
    d = updateParticipant(d, rel, 1, { min: 1, max: 1 });
    d = setExternalVia(d, auto, [rel]);
    const g = addGeneralization(d, prop, [auto]); d = g.diagram;
    const after = deleteElements(d, [prop]);
    expect(after.relationships).toHaveLength(0);
    expect(after.generalizations).toHaveLength(0);
    expect(entityById(after, auto)!.primary).toBeNull();
  });

  it("cancellare un attributo lo toglie dall'identificatore", () => {
    let { d, auto, targa } = base();
    d = toggleIdentifierAttribute(d, auto, targa);
    const after = deleteElements(d, [targa]);
    expect(entityById(after, auto)!.attributes).toHaveLength(0);
    expect(entityById(after, auto)!.primary).toBeNull();
  });

  it('copia e incolla con id e nomi nuovi, associazione compresa solo se ci sono tutti i lati', () => {
    let { d, auto, prop, targa } = base();
    d = toggleIdentifierAttribute(d, auto, targa);
    const onlyAuto = pasteElements(d, copyElements(d, [auto]));
    expect(onlyAuto.diagram.relationships).toHaveLength(1);
    const both = pasteElements(d, copyElements(d, [auto, prop]));
    const d2: Diagram = both.diagram;
    expect(d2.entities.map((e) => e.name)).toEqual(['Auto', 'Proprietario', 'Auto 2', 'Proprietario 2']);
    expect(d2.relationships).toHaveLength(2);
    const copy = d2.entities[2];
    expect(copy.id).not.toBe(auto);
    expect(copy.pos).toEqual({ x: 32, y: 32 });
    expect(copy.primary!.attributeIds).toEqual([copy.attributes[0].id]);
    expect(both.ids).toHaveLength(3);
  });
});

describe('redistributeAttributes', () => {
  it('toglie gli attributi dalla traiettoria delle linee', () => {
    let d = createDiagram();
    const a = addEntity(d, { x: 0, y: 0 }, 'A'); d = a.diagram;
    const b = addEntity(d, { x: 0, y: -300 }, 'B'); d = b.diagram;
    d = addAttribute(d, a.id, 'x').diagram; // finisce in alto, dove poi andrà la linea
    d = addRelationship(d, [a.id, b.id], undefined, 'lega').diagram;
    const out = redistributeAttributes(d);
    const lines = connectedAngles(out, a.id);
    const angle = out.entities[0].attributes[0].angle;
    expect(Math.min(...lines.map((l) => angDist(l, angle)))).toBeGreaterThan(0.5);
  });

  it("setIdentifying: rende identificante l'associazione e la imposta 1:N (debole (1,1), proprietario (0,N))", () => {
    let { d, auto, prop, rel } = base();
    d = setIdentifying(d, auto, rel, true);
    const e = entityById(d, auto)!;
    expect(e.weak).toBe(true);
    expect(e.primary!.externalVia).toEqual([rel]);
    const r = relationshipById(d, rel)!;
    expect(r.participants.find((p) => p.entityId === auto)).toMatchObject({ min: 1, max: 1 });
    expect(r.participants.find((p) => p.entityId === prop)).toMatchObject({ min: 0, max: 'N' });
    d = setIdentifying(d, auto, rel, false);
    expect(entityById(d, auto)!.primary).toBeNull();
  });

  it('setIdentifying non tocca la cardinalità già scelta per il proprietario (1:1 resta 1:1)', () => {
    let { d, auto, prop, rel } = base();
    d = updateParticipant(d, rel, 0, { min: 1, max: 1 });
    d = updateParticipant(d, rel, 1, { min: 0, max: 'N' });
    d = setIdentifying(d, auto, rel, true);
    const r = relationshipById(d, rel)!;
    expect(r.participants.find((p) => p.entityId === prop)).toMatchObject({ min: 1, max: 1 });
    expect(r.participants.find((p) => p.entityId === auto)).toMatchObject({ min: 1, max: 1 });
  });

  it("setWeak: dichiara l'entità debole; toglierla scollega l'associazione identificante", () => {
    let { d, auto, rel } = base();
    d = updateParticipant(d, rel, 1, { min: 1, max: 1 });
    d = setWeak(d, auto, true);
    expect(entityById(d, auto)!.weak).toBe(true);
    d = setExternalVia(d, auto, [rel]);
    d = setWeak(d, auto, false);
    expect(entityById(d, auto)!.weak).toBeUndefined();
    expect(entityById(d, auto)!.primary).toBeNull();
  });
});
