import {
  addAttribute, addAttributePart, addEntity, copyElements, createDiagram, deleteElements, pasteElements, rename,
  toggleIdentifierAttribute, updateAttribute, updatePart,
} from './commands';
import { Diagram, Id, findPart, kindOf } from './model';
import { toLogical } from './logical';
import { buildScene } from './scene';
import { parseDiagramFile, serializeDiagram } from './serialize';
import { validate } from './validate';

/** Studente(matricola, nome, indirizzo(via, n. civico, CAP)) come nella slide «Attributi composti». */
function studente(): { d: Diagram; e: Id; ind: Id; parts: Id[] } {
  let d = createDiagram();
  const e = addEntity(d, { x: 0, y: 0 }, 'Studente'); d = e.diagram;
  const m = addAttribute(d, e.id, 'matricola'); d = toggleIdentifierAttribute(m.diagram, e.id, m.id);
  d = addAttribute(d, e.id, 'nome').diagram;
  const ind = addAttribute(d, e.id, 'indirizzo'); d = ind.diagram;
  const parts: Id[] = [];
  for (const n of ['via', 'n. civico', 'CAP']) {
    const p = addAttributePart(d, ind.id, n); d = p.diagram; parts.push(p.id);
  }
  return { d, e: e.id, ind: ind.id, parts };
}

describe('attributi composti', () => {
  it("si costruiscono aggiungendo parti a un attributo, e le parti si trovano per id", () => {
    const { d, ind, parts } = studente();
    const found = findPart(d, parts[1])!;
    expect(found.attribute.id).toBe(ind);
    expect(found.part.name).toBe('n. civico');
    expect(kindOf(d, parts[1])).toBe('part');
  });

  it('una parte si rinomina, diventa opzionale e si cancella; senza parti torna semplice', () => {
    let { d, ind, parts } = studente();
    d = rename(d, parts[0], '  via e piazza ');
    d = updatePart(d, parts[2], { card: '0,1' });
    expect(findPart(d, parts[0])!.part.name).toBe('via e piazza');
    expect(findPart(d, parts[2])!.part.card).toBe('0,1');
    d = deleteElements(d, parts);
    const a = d.entities[0].attributes.find((x) => x.id === ind)!;
    expect(a.parts).toBeUndefined();
  });

  it('copia e incolla danno id nuovi anche alle parti', () => {
    const { d, e, parts } = studente();
    const pasted = pasteElements(d, copyElements(d, [e]), { x: 50, y: 50 });
    const copy = pasted.diagram.entities[1];
    const copyParts = copy.attributes.find((a) => a.name === 'indirizzo')!.parts!;
    expect(copyParts.map((p) => p.name)).toEqual(['via', 'n. civico', 'CAP']);
    expect(copyParts.some((p) => parts.includes(p.id))).toBe(false);
  });

  it('nello schema logico il composto e sostituito dalle sue parti', () => {
    const { d } = studente();
    const t = toLogical(d).tables[0];
    expect(t.columns.map((c) => c.name)).toEqual(['matricola', 'nome', 'via', 'n_civico', 'CAP']);
  });

  it('parti opzionali o composto opzionale: colonne che possono essere NULL', () => {
    let { d, ind, parts } = studente();
    d = updatePart(d, parts[1], { card: '0,1' });
    let cols = toLogical(d).tables[0].columns;
    expect(cols.find((c) => c.name === 'n_civico')!.nullable).toBe(true);
    expect(cols.find((c) => c.name === 'via')!.nullable).toBe(false);
    d = updateAttribute(d, ind, { card: '0,1' });
    cols = toLogical(d).tables[0].columns;
    expect(cols.filter((c) => ['via', 'n_civico', 'CAP'].includes(c.name)).every((c) => c.nullable)).toBe(true);
  });

  it("se una parte ha lo stesso nome di un altro attributo, prende il prefisso del composto", () => {
    let { d, ind } = studente();
    d = addAttributePart(d, ind, 'nome').diagram;
    expect(toLogical(d).tables[0].columns.map((c) => c.name)).toContain('indirizzo_nome');
  });

  it("un composto nell'identificatore porta nella chiave tutte le sue parti", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Sede'); d = e.diagram;
    const ind = addAttribute(d, e.id, 'indirizzo'); d = toggleIdentifierAttribute(ind.diagram, e.id, ind.id);
    d = addAttributePart(d, ind.id, 'via').diagram;
    d = addAttributePart(d, ind.id, 'civico').diagram;
    expect(toLogical(d).tables[0].primaryKey).toEqual(['via', 'civico']);
  });

  it('validazione: composto con una parte sola (avviso) e composto multivalore (errore spiegato)', () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = e.diagram;
    const k = addAttribute(d, e.id, 'CF'); d = toggleIdentifierAttribute(k.diagram, e.id, k.id);
    const ind = addAttribute(d, e.id, 'indirizzo'); d = ind.diagram;
    d = addAttributePart(d, ind.id, 'via').diagram;
    expect(validate(d).find((i) => i.code === 'composite-one-part')?.severity).toBe('warning');
    d = updateAttribute(d, ind.id, { card: '0,N' });
    const err = validate(d).find((i) => i.code === 'multivalued-composite')!;
    expect(err.severity).toBe('error');
    expect(err.message).toContain('indirizzo');
  });

  it('il disegno: ovale col nome e le parti a ventaglio, senza pallino per il composto', () => {
    const { d, ind } = studente();
    const s = buildScene(d, [], new Set());
    const a = s.attributes.find((x) => x.id === ind)!;
    expect(a.composite).toBeTruthy();
    expect(a.composite!.parts.map((p) => p.text)).toEqual(['via', 'n. civico', 'CAP']);
    const dots = a.composite!.parts.map((p) => p.geom.dot);
    // tre parti in tre punti diversi, lontani dall'ovale
    expect(new Set(dots.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBe(3);
    for (const p of dots) expect(Math.hypot(p.x - a.composite!.center.x, p.y - a.composite!.center.y)).toBeGreaterThan(a.composite!.rx);
    // i limiti del disegno comprendono le etichette delle parti
    for (const p of dots) {
      expect(p.x).toBeGreaterThanOrEqual(s.bounds!.minX);
      expect(p.x).toBeLessThanOrEqual(s.bounds!.maxX);
    }
  });

  it('il file .er.json conserva le parti', () => {
    const { d } = studente();
    const r = parseDiagramFile(serializeDiagram(d));
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.entities[0].attributes[2].parts!.map((p) => p.name)).toEqual(['via', 'n. civico', 'CAP']);
  });
});
