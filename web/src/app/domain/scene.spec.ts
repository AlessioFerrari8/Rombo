import {
  addAttribute, addEntity, addGeneralization, addRelationship, createDiagram, setExternalVia, toggleIdentifierAttribute,
  updateGeneralization, updateParticipant,
} from './commands';
import { buildCarrozzeria } from './fixtures/carrozzeria';
import { buildScene, elementBounds, sceneExportBounds } from './scene';
import { validate } from './validate';

describe('buildScene', () => {
  it("disegna tutto l'esercizio", () => {
    const d = buildCarrozzeria();
    const s = buildScene(d, validate(d), new Set());
    expect(s.entities).toHaveLength(4);
    expect(s.relationships).toHaveLength(3);
    expect(s.attributes).toHaveLength(16);
    expect(s.links).toHaveLength(6);
    expect(s.links.find((l) => l.cardText === '(1,N)')).toBeTruthy();
    expect(s.attributes.filter((a) => a.key).map((a) => a.text).sort()).toEqual(['CF', 'Codice', 'Matricola', 'Targa']);
    expect(s.attributes.find((a) => a.text.startsWith('Telefono'))!.text).toBe('Telefono (0,1)');
  });

  it("segna gli elementi con errori e quelli selezionati", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Auto'); d = e.diagram;
    const s = buildScene(d, validate(d), new Set([e.id]));
    expect(s.entities[0]).toMatchObject({ error: true, issues: 1, selected: true });
  });

  it("l'identificatore composto si disegna come una barra, non come pallini pieni", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Auto'); d = e.diagram;
    const a = addAttribute(d, e.id, 'Targa'); d = a.diagram;
    const b = addAttribute(d, e.id, 'Nazione'); d = b.diagram;
    d = toggleIdentifierAttribute(toggleIdentifierAttribute(d, e.id, a.id), e.id, b.id);
    const s = buildScene(d, [], new Set());
    expect(s.attributes.every((x) => !x.key)).toBe(true);
    expect(s.idBars).toHaveLength(1);
    // i due attributi, piu' gli angoli che servono a non passare sotto l'entita'
    expect(s.idBars[0].points.length).toBeGreaterThanOrEqual(2);
    const box = s.entities[0].box;
    for (const p of s.idBars[0].points) expect(Math.abs(p.x - box.x) >= box.w / 2 || Math.abs(p.y - box.y) >= box.h / 2).toBe(true);
  });

  it("l'associazione ricorsiva ha due rami a gomito distinti, con i ruoli", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = e.diagram;
    const r = addRelationship(d, [e.id, e.id], undefined, 'genitore'); d = r.diagram;
    d = updateParticipant(d, r.id, 0, { role: 'genitore di' });
    d = updateParticipant(d, r.id, 1, { role: 'figlio di' });
    const s = buildScene(d, [], new Set());
    const [a, b] = s.links;
    expect(a.points.length).toBeGreaterThanOrEqual(3);
    expect(b.points.length).toBeGreaterThanOrEqual(3);
    // partono da vertici diversi del rombo e arrivano in punti diversi dell'entita'
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(dist(a.points[0], b.points[0])).toBeGreaterThan(30);
    expect(dist(a.points.at(-1)!, b.points.at(-1)!)).toBeGreaterThan(30);
    // i due rami non condividono nessun segmento
    const ys = (l: typeof a) => l.points.map((p) => Math.round(p.y));
    expect(ys(a).filter((y) => ys(b).includes(y))).toEqual([]);
    expect(dist(a.rolePos, b.rolePos)).toBeGreaterThan(30);
  });

  it('notazioni del libro: tratteggio se opzionale, 1:N sul rombo, doppio bordo per le deboli', () => {
    let d = createDiagram();
    const g = addEntity(d, { x: 0, y: 0 }, 'Giocatore'); d = g.diagram;
    const rec = addEntity(d, { x: 400, y: 0 }, 'Record'); d = rec.diagram;
    const dataAttr = addAttribute(d, rec.id, 'data'); d = dataAttr.diagram;
    const r = addRelationship(d, [g.id, rec.id], undefined, 'stabilisce'); d = r.diagram;
    d = updateParticipant(d, r.id, 0, { min: 0, max: 'N' });
    d = updateParticipant(d, r.id, 1, { min: 1, max: 1 });
    d = toggleIdentifierAttribute(d, rec.id, dataAttr.id);
    d = setExternalVia(d, rec.id, [r.id]);
    const s = buildScene(d, [], new Set());
    expect(s.links.map((l) => l.optional)).toEqual([true, false]);
    expect(s.relationships[0].kindLabel).toBe('1:N');
    expect(s.entities.find((e) => e.name === 'Record')!.weak).toBe(true);
    expect(s.entities.find((e) => e.name === 'Giocatore')!.weak).toBe(false);
  });

  it('molteplicita\' numerica come nel libro: (1,25) e la relazione resta 1:N', () => {
    let d = createDiagram();
    const a = addEntity(d, { x: 0, y: 0 }, 'Studente'); d = a.diagram;
    const b = addEntity(d, { x: 400, y: 0 }, 'Classe'); d = b.diagram;
    const r = addRelationship(d, [a.id, b.id], undefined, 'frequenta'); d = r.diagram;
    d = updateParticipant(d, r.id, 0, { min: 1, max: 1 });
    d = updateParticipant(d, r.id, 1, { min: 1, max: 25 });
    const s = buildScene(d, [], new Set());
    expect(s.links.map((l) => l.cardText)).toEqual(['(1,1)', '(1,25)']);
    expect(s.relationships[0].kindLabel).toBe('1:N');
  });

  it("la barra dell'identificatore esterno resta tutta fuori dall'entita', pallino compreso", () => {
    let d = createDiagram();
    const g = addEntity(d, { x: 0, y: 0 }, 'Giocatore'); d = g.diagram;
    const rec = addEntity(d, { x: 400, y: 0 }, 'Record'); d = rec.diagram;
    const dataAttr = addAttribute(d, rec.id, 'data'); d = dataAttr.diagram;
    const r = addRelationship(d, [g.id, rec.id], undefined, 'stabilisce'); d = r.diagram;
    d = updateParticipant(d, r.id, 1, { min: 1, max: 1 });
    d = toggleIdentifierAttribute(d, rec.id, dataAttr.id);
    d = setExternalVia(d, rec.id, [r.id]);
    const s = buildScene(d, [], new Set());
    const box = s.entities.find((e) => e.name === 'Record')!.box;
    const inside = (p: { x: number; y: number }) => Math.abs(p.x - box.x) < box.w / 2 && Math.abs(p.y - box.y) < box.h / 2;
    const bar = s.idBars[0];
    const pts = [...bar.points, bar.end];
    for (const pt of pts) expect(inside(pt)).toBe(false);
    for (let i = 1; i < pts.length; i++) {
      for (const t of [0.25, 0.5, 0.75]) {
        expect(inside({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t })).toBe(false);
      }
    }
  });

  it('IS-A come nel libro: freccia vuota sotto il padre, barra e rami verso i figli, sigla (p,s)', () => {
    let d = createDiagram();
    const p = addEntity(d, { x: 0, y: 0 }, 'DietaAnimale'); d = p.diagram;
    const a = addEntity(d, { x: -200, y: 250 }, 'Erbivoro'); d = a.diagram;
    const b = addEntity(d, { x: 200, y: 250 }, 'Carnivoro'); d = b.diagram;
    const g = addGeneralization(d, p.id, [a.id, b.id]); d = g.diagram;
    d = updateGeneralization(d, g.id, { total: false, exclusive: false });
    const isa = buildScene(d, [], new Set()).isas[0];
    expect(isa.label).toBe('(p,s)');
    // la punta tocca il bordo inferiore del padre, la base e' piu' in basso e larga
    expect(isa.geom.arrow.tip.y).toBeCloseTo(28);
    expect(isa.geom.arrow.left.y).toBeGreaterThan(isa.geom.arrow.tip.y + 15);
    expect(Math.abs(isa.geom.arrow.right.x - isa.geom.arrow.left.x)).toBeGreaterThanOrEqual(60);
    // tutti i segmenti sono orizzontali o verticali
    for (const [m, n] of isa.geom.lines) expect(m.x === n.x || m.y === n.y).toBe(true);
  });

  it('i limiti del disegno comprendono i rami della ricorsiva e le etichette dei ruoli', () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = e.diagram;
    const r = addRelationship(d, [e.id, e.id], { x: -200, y: 0 }, 'genitore'); d = r.diagram;
    d = updateParticipant(d, r.id, 0, { role: 'genitore di' });
    const s = buildScene(d, [], new Set());
    for (const l of s.links) for (const pt of l.points) expect(pt.x).toBeGreaterThanOrEqual(s.bounds!.minX);
    const role = s.links.find((l) => l.role)!;
    expect(role.rolePos.x - 'genitore di'.length * 4).toBeGreaterThanOrEqual(s.bounds!.minX);
    expect(sceneExportBounds(d)).toEqual(s.bounds);
  });

  it('sui rami verticali della ricorsiva il ruolo sta di lato, non sopra la linea', () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = e.diagram;
    const r = addRelationship(d, [e.id, e.id], { x: 0, y: 200 }, 'genitore'); d = r.diagram;
    d = updateParticipant(d, r.id, 0, { role: 'genitore di' });
    d = updateParticipant(d, r.id, 1, { role: 'figlio di' });
    const [a, b] = buildScene(d, [], new Set()).links;
    expect(a.roleAnchor).toBe('end');
    expect(b.roleAnchor).toBe('start');
    expect(a.rolePos.x).toBeLessThan(Math.min(...a.points.map((p) => p.x)));
    expect(b.rolePos.x).toBeGreaterThan(Math.max(...b.points.map((p) => p.x)));
  });

  it('calcola i limiti di un gruppo di elementi', () => {
    const d = buildCarrozzeria();
    const s = buildScene(d, [], new Set());
    const b = elementBounds(s, [d.entities[0].id])!;
    expect(b.minX).toBeLessThan(120);
    expect(b.maxX).toBeGreaterThan(120);
  });
});
