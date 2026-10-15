import {
  addAttribute, addEntity, addGeneralization, addRelationship, createDiagram, setAlternates, setExternalVia, setWeak,
  toggleIdentifierAttribute, updateAttribute, updateGeneralization, updateParticipant,
} from './commands';
import { Diagram, Id } from './model';
import { findCycles, validate } from './validate';

function entity(d: Diagram, name: string, withKey = true): { d: Diagram; id: Id; key?: Id } {
  const e = addEntity(d, { x: 0, y: 0 }, name);
  if (!withKey) return { d: e.diagram, id: e.id };
  const a = addAttribute(e.diagram, e.id, 'Codice');
  return { d: toggleIdentifierAttribute(a.diagram, e.id, a.id), id: e.id, key: a.id };
}

const codes = (d: Diagram) => validate(d).map((i) => i.code);

describe('validate', () => {
  it("segnala l'entita senza identificatore con un messaggio che dice cosa fare", () => {
    const { d } = entity(createDiagram(), 'Auto', false);
    const [issue] = validate(d);
    expect(issue.code).toBe('no-primary');
    expect(issue.severity).toBe('error');
    expect(issue.message).toBe('«Auto» non ha un identificatore: clicca il pallino di un attributo per sceglierlo.');
  });

  it('segnala nomi vuoti e duplicati (senza distinguere maiuscole)', () => {
    let { d } = entity(createDiagram(), 'Auto');
    d = entity(d, 'auto').d;
    d = entity(d, '  ').d;
    expect(codes(d)).toContain('duplicate-name');
    expect(codes(d)).toContain('empty-name');
  });

  it('segnala la cardinalita mancante nominando entita e associazione', () => {
    let a = entity(createDiagram(), 'Proprietario');
    const b = entity(a.d, 'Auto');
    const r = addRelationship(b.d, [a.id, b.id], undefined, 'possiede');
    const msgs = validate(r.diagram).filter((i) => i.code === 'missing-cardinality').map((i) => i.message);
    expect(msgs).toContain('Manca la cardinalità di «Proprietario» in «possiede»: sceglila nel pannello Proprietà.');
  });

  it("l'associazione ricorsiva vuole ruoli diversi", () => {
    const e = entity(createDiagram(), 'Dipendente');
    let r = addRelationship(e.d, [e.id, e.id], undefined, 'supervisiona');
    let d = updateParticipant(r.diagram, r.id, 0, { min: 0, max: 'N' });
    d = updateParticipant(d, r.id, 1, { min: 0, max: 1 });
    expect(codes(d)).toContain('recursive-needs-roles');
    d = updateParticipant(d, r.id, 0, { role: 'capo' });
    d = updateParticipant(d, r.id, 1, { role: 'sottoposto' });
    expect(codes(d)).not.toContain('recursive-needs-roles');
  });

  it("l'identificatore esterno richiede (1,1) in un'associazione binaria", () => {
    const a = entity(createDiagram(), 'Squadra');
    const b = entity(a.d, 'Giocatore', false);
    const r = addRelationship(b.d, [b.id, a.id], undefined, 'gioca');
    let d = updateParticipant(r.diagram, r.id, 0, { min: 0, max: 'N' });
    d = updateParticipant(d, r.id, 1, { min: 1, max: 'N' });
    d = setExternalVia(d, b.id, [r.id]);
    expect(codes(d)).toContain('external-id-not-11');
    d = updateParticipant(d, r.id, 0, { min: 1, max: 1 });
    expect(codes(d)).not.toContain('external-id-not-11');
  });

  it("un'entità debole senza associazione identificante è un errore", () => {
    const a = entity(createDiagram(), 'Squadra');
    const b = entity(a.d, 'Giocatore', false);
    const r = addRelationship(b.d, [b.id, a.id], undefined, 'gioca');
    let d = updateParticipant(r.diagram, r.id, 0, { min: 1, max: 1 });
    d = updateParticipant(d, r.id, 1, { min: 0, max: 'N' });
    d = setWeak(d, b.id, true);
    expect(codes(d)).toContain('weak-no-identifier');
    d = setExternalVia(d, b.id, [r.id]);
    expect(codes(d)).not.toContain('weak-no-identifier');
  });

  it("un attributo dell'identificatore deve essere (1,1)", () => {
    const a = entity(createDiagram(), 'Auto');
    const d = updateAttribute(a.d, a.key!, { card: '0,1' });
    expect(codes(d)).toContain('identifier-not-single');
  });

  it('i figli di una IS-A non hanno identificatore proprio', () => {
    const p = entity(createDiagram(), 'Dipendente');
    const c = entity(p.d, 'Meccanico');
    const g = addGeneralization(c.d, p.id, [c.id]);
    expect(codes(g.diagram)).toContain('isa-child-has-identifier');
    const bare = entity(p.d, 'Carrozziere', false);
    expect(codes(addGeneralization(bare.d, p.id, [bare.id]).diagram)).not.toContain('no-primary');
  });

  it("accorpare il padre nei figli e vietato se la gerarchia e parziale", () => {
    const p = entity(createDiagram(), 'Dipendente');
    const c = entity(p.d, 'Meccanico', false);
    const g = addGeneralization(c.d, p.id, [c.id]);
    const d = updateGeneralization(g.diagram, g.id, { strategy: 'merge-down' });
    expect(codes(d)).toContain('merge-down-partial');
  });

  it('vieta un merge-down il cui padre e coinvolto in un\'altra gerarchia con strategia diversa (X1: merge-up sopra)', () => {
    const persona = entity(createDiagram(), 'Persona');
    const dip = entity(persona.d, 'Dipendente', false);
    const mec = entity(dip.d, 'Meccanico', false);
    const g1 = addGeneralization(mec.d, persona.id, [dip.id]);
    let d = updateGeneralization(g1.diagram, g1.id, { total: true, exclusive: true, strategy: 'merge-up' });
    const g2 = addGeneralization(d, dip.id, [mec.id]);
    d = updateGeneralization(g2.diagram, g2.id, { total: true, exclusive: true, strategy: 'merge-down' });
    expect(codes(d)).toContain('isa-mixed-strategies');
  });

  it('vieta un merge-down il cui padre e coinvolto in un\'altra gerarchia con strategia diversa (X2: replace sopra)', () => {
    const persona = entity(createDiagram(), 'Persona');
    const dip = entity(persona.d, 'Dipendente', false);
    const mec = entity(dip.d, 'Meccanico', false);
    const g1 = addGeneralization(mec.d, persona.id, [dip.id]);
    let d = updateGeneralization(g1.diagram, g1.id, { total: true, exclusive: true, strategy: 'replace' });
    const g2 = addGeneralization(d, dip.id, [mec.id]);
    d = updateGeneralization(g2.diagram, g2.id, { total: true, exclusive: true, strategy: 'merge-down' });
    expect(codes(d)).toContain('isa-mixed-strategies');
  });

  it('vieta un merge-down il cui padre e coinvolto in un\'altra gerarchia con strategia diversa (X3: stesso padre, replace + merge-down)', () => {
    const persona = entity(createDiagram(), 'Persona');
    const studente = entity(persona.d, 'Studente', false);
    const dip = entity(studente.d, 'Dipendente', false);
    const g1 = addGeneralization(dip.d, persona.id, [studente.id]);
    let d = updateGeneralization(g1.diagram, g1.id, { total: true, exclusive: true, strategy: 'replace' });
    const g2 = addGeneralization(d, persona.id, [dip.id]);
    d = updateGeneralization(g2.diagram, g2.id, { total: true, exclusive: true, strategy: 'merge-down' });
    expect(codes(d)).toContain('isa-mixed-strategies');
  });

  it('permette una catena tutta merge-down (probe B)', () => {
    const persona = entity(createDiagram(), 'Persona');
    const dip = entity(persona.d, 'Dipendente', false);
    const mec = entity(dip.d, 'Meccanico', false);
    const g1 = addGeneralization(mec.d, persona.id, [dip.id]);
    let d = updateGeneralization(g1.diagram, g1.id, { total: true, exclusive: true, strategy: 'merge-down' });
    const g2 = addGeneralization(d, dip.id, [mec.id]);
    d = updateGeneralization(g2.diagram, g2.id, { total: true, exclusive: true, strategy: 'merge-down' });
    expect(codes(d)).not.toContain('isa-mixed-strategies');
  });

  it('segnala tipi SQL non validi', () => {
    const a = entity(createDiagram(), 'Auto');
    expect(codes(updateAttribute(a.d, a.key!, { type: 'VARCHAR' }))).toContain('invalid-sql-type');
    expect(codes(updateAttribute(a.d, a.key!, { type: 'DECIMAL(8,2)' }))).not.toContain('invalid-sql-type');
  });

  it('avvisi: entita isolata, nome generico, multivalore, IS-A senza strategia', () => {
    const a = entity(createDiagram(), 'Auto');
    const b = entity(a.d, 'Persona');
    const c = entity(b.d, 'Isolata');
    const r = addRelationship(c.d, [a.id, b.id], undefined, 'R1');
    const m = addAttribute(r.diagram, b.id, 'Telefoni', '1,N');
    const g = addGeneralization(m.diagram, b.id, [a.id]);
    const warnings = validate(g.diagram).filter((i) => i.severity === 'warning').map((i) => i.code);
    expect(warnings).toEqual(expect.arrayContaining(['isolated-entity', 'generic-relationship-name', 'multivalued-attribute', 'isa-default-strategy']));
  });

  it('il nome troppo lungo per un database è un errore solo oltre 60 caratteri', () => {
    const ok = entity(createDiagram(), 'A'.repeat(60), false);
    expect(codes(ok.d)).not.toContain('name-too-long');
    const bad = entity(createDiagram(), 'A'.repeat(61), false);
    const issue = validate(bad.d).find((i) => i.code === 'name-too-long');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toBe(`Il nome «${'A'.repeat(20)}…» è troppo lungo per un database: al massimo 60 caratteri.`);
  });

  it('segnala TEXT in un identificatore: MySQL non lo accetta', () => {
    const a = entity(createDiagram(), 'Auto');
    const d = updateAttribute(a.d, a.key!, { type: 'TEXT' });
    const issue = validate(d).find((i) => i.code === 'text-in-key');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toBe('«Codice» è TEXT e fa parte di una chiave di «Auto»: MySQL non lo accetta, scegli VARCHAR.');
  });

  it('segnala TEXT in una chiave alternativa', () => {
    const a = entity(createDiagram(), 'Auto');
    const attr = addAttribute(a.d, a.id, 'Targa');
    let d = updateAttribute(attr.diagram, attr.id, { type: 'TEXT' });
    d = setAlternates(d, a.id, [[attr.id]]);
    expect(codes(d)).toContain('text-in-key');
  });

  it('mette gli errori prima degli avvisi', () => {
    const a = entity(createDiagram(), 'Auto', false);
    const b = entity(a.d, 'Isolata');
    const severities = validate(b.d).map((i) => i.severity);
    expect(severities).toEqual([...severities].sort((x, y) => (x === y ? 0 : x === 'error' ? -1 : 1)));
  });
});

describe('findCycles', () => {
  it('trova ogni ciclo una volta sola', () => {
    const g = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['d']]]);
    const cycles = findCycles(g).map((c) => [...c].sort().join(''));
    expect(cycles.sort()).toEqual(['abc', 'd']);
  });
});
