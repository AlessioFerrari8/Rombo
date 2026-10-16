import {
  addAttribute, addEntity, addGeneralization, addRelationship, createDiagram, setExternalVia, setWeak, toggleIdentifierAttribute,
  updateAttribute, updateGeneralization, updateParticipant,
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
    expect(s.relationships[0].identifying).toBe(true);
  });

  it("entità debole dichiarata: doppio bordo anche prima di scegliere l'associazione, rombo doppio solo dopo", () => {
    let d = createDiagram();
    const g = addEntity(d, { x: 0, y: 0 }, 'Giocatore'); d = g.diagram;
    const rec = addEntity(d, { x: 400, y: 0 }, 'Record'); d = rec.diagram;
    const r = addRelationship(d, [g.id, rec.id], undefined, 'stabilisce'); d = r.diagram;
    d = setWeak(d, rec.id, true);
    let s = buildScene(d, [], new Set());
    expect(s.entities.find((e) => e.name === 'Record')!.weak).toBe(true);
    expect(s.relationships[0].identifying).toBe(false);
    d = setExternalVia(d, rec.id, [r.id]);
    s = buildScene(d, [], new Set());
    expect(s.relationships[0].identifying).toBe(true);
  });

  it("l'etichetta 1:N non finisce sopra le linee: sopra il rombo se libero, altrimenti di lato", () => {
    const build = (ax: number, ay: number, bx: number, by: number) => {
      let d = createDiagram();
      const a = addEntity(d, { x: ax, y: ay }, 'A'); d = a.diagram;
      const b = addEntity(d, { x: bx, y: by }, 'B'); d = b.diagram;
      const r = addRelationship(d, [a.id, b.id], undefined, 'lega'); d = r.diagram;
      d = updateParticipant(d, r.id, 0, { min: 0, max: 'N' });
      d = updateParticipant(d, r.id, 1, { min: 1, max: 1 });
      return buildScene(d, [], new Set()).relationships[0];
    };
    const row = build(0, 0, 400, 0);
    expect(row.kindPos).toEqual({ x: row.box.x, y: row.box.y - row.box.h / 2 - 10, anchor: 'middle' });
    // entita' sopra e sotto: le linee escono dai vertici in alto e in basso
    const col = build(0, 0, 0, 400);
    expect(Math.abs(col.kindPos!.x - col.box.x)).toBeGreaterThan(20);
    expect(col.kindPos!.anchor).not.toBe('middle');
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

  describe("identificatore esterno dell'entità debole: taglietto col pallino sul ramo identificante", () => {
    // Giocatore (debole, chiave parziale Numero) al centro, Squadra a destra/sinistra/sotto/sopra
    const weak = (ox: number, oy: number, partial = ['Numero'], wCard: [0 | 1, 1 | 'N'] = [1, 1]) => {
      let d = createDiagram();
      const w = addEntity(d, { x: 0, y: 0 }, 'Giocatore'); d = w.diagram;
      const o = addEntity(d, { x: ox, y: oy }, 'Squadra'); d = o.diagram;
      for (const n of partial) {
        const a = addAttribute(d, w.id, n); d = toggleIdentifierAttribute(a.diagram, w.id, a.id);
      }
      d = addAttribute(d, w.id, 'Ruolo').diagram;
      const r = addRelationship(d, [o.id, w.id], undefined, 'gioca'); d = r.diagram;
      d = updateParticipant(d, r.id, 0, { min: 0, max: 'N' });
      d = updateParticipant(d, r.id, 1, { min: wCard[0], max: wCard[1] });
      d = setExternalVia(d, w.id, [r.id]);
      return { s: buildScene(d, [], new Set()), w: w.id, r: r.id };
    };
    const sides: Array<[string, number, number]> = [['destra', 400, 0], ['sinistra', -400, 0], ['sotto', 0, 400], ['sopra', 0, -400]];

    for (const [side, ox, oy] of sides) {
      it(`proprietario a ${side}: il taglietto parte dal ramo vicino al bordo, perpendicolare, fuori da tutto`, () => {
        const { s, w, r } = weak(ox, oy);
        const link = s.links.find((l) => l.relId === r && l.index === 1)!;
        expect(s.extIds).toHaveLength(1);
        const t = s.extIds[0];
        expect(t).toMatchObject({ entityId: w, relIds: [r] });
        // un solo ramo: un taglietto, cioe' un segmento
        expect(t.points).toHaveLength(2);
        const from = t.points[0];
        const ux = (link.from.x - link.to.x) / Math.hypot(link.from.x - link.to.x, link.from.y - link.to.y);
        const uy = (link.from.y - link.to.y) / Math.hypot(link.from.x - link.to.x, link.from.y - link.to.y);
        // la base sta sul ramo, a poca distanza dal bordo dell'entita' (verso il rombo)
        const along = (from.x - link.to.x) * ux + (from.y - link.to.y) * uy;
        const across = (from.x - link.to.x) * -uy + (from.y - link.to.y) * ux;
        expect(along).toBeGreaterThan(6);
        expect(along).toBeLessThan(24);
        expect(Math.abs(across)).toBeLessThan(1e-6);
        // perpendicolare al ramo, lunga quanto un'asticella
        const tx = t.dot.x - from.x;
        const ty = t.dot.y - from.y;
        expect(Math.abs(tx * ux + ty * uy)).toBeLessThan(1e-6);
        expect(Math.hypot(tx, ty)).toBeGreaterThanOrEqual(14);
        expect(Math.hypot(tx, ty)).toBeLessThanOrEqual(22);
        // pallino fuori dall'entita', lontano da cardinalita' e attributi
        const box = s.entities.find((e) => e.id === w)!.box;
        expect(Math.abs(t.dot.x - box.x) > box.w / 2 + 4 || Math.abs(t.dot.y - box.y) > box.h / 2 + 4).toBe(true);
        expect(Math.abs(t.dot.x - link.card.x) < 22 && Math.abs(t.dot.y - link.card.y) < 12).toBe(false);
        for (const a of s.attributes) expect(Math.hypot(a.geom.dot.x - t.dot.x, a.geom.dot.y - t.dot.y)).toBeGreaterThan(14);
        // la chiave parziale semplice ha il pallino pieno; nessuna barra che gira attorno all'entita'
        expect(s.attributes.find((a) => a.text === 'Numero')!.key).toBe(true);
        expect(s.idBars).toEqual([]);
      });
    }

    it('con qualunque cardinalità, N:N compreso', () => {
      const { s } = weak(400, 0, ['Numero'], [1, 'N']);
      expect(s.extIds).toHaveLength(1);
      expect(s.relationships[0]).toMatchObject({ identifying: true, kindLabel: 'N:N' });
    });

    it('chiave parziale di più attributi: barra solo fra gli attributi, più il taglietto sul ramo', () => {
      const { s } = weak(400, 0, ['Numero', 'Nazione']);
      expect(s.extIds).toHaveLength(1);
      expect(s.idBars).toHaveLength(1);
      const link = s.links[1];
      // la barra non tocca il ramo dell'associazione
      for (const p of s.idBars[0].points) expect(Math.hypot(p.x - link.to.x, p.y - link.to.y)).toBeGreaterThan(20);
    });

    // ESAME fra STUDENTE e CORSO: due associazioni identificanti, un arco solo
    const esame = (sx: number, sy: number, cx: number, cy: number, attrAngles?: [number, number]) => {
      let d = createDiagram();
      const e = addEntity(d, { x: 0, y: 0 }, 'Esame'); d = e.diagram;
      const st = addEntity(d, { x: sx, y: sy }, 'Studente'); d = st.diagram;
      const co = addEntity(d, { x: cx, y: cy }, 'Corso'); d = co.diagram;
      const data = addAttribute(d, e.id, 'Data'); d = toggleIdentifierAttribute(data.diagram, e.id, data.id);
      const voto = addAttribute(d, e.id, 'Voto'); d = voto.diagram;
      if (attrAngles) {
        d = updateAttribute(d, data.id, { angle: attrAngles[0] });
        d = updateAttribute(d, voto.id, { angle: attrAngles[1] });
      }
      const r1 = addRelationship(d, [st.id, e.id], undefined, 'sostiene'); d = r1.diagram;
      const r2 = addRelationship(d, [co.id, e.id], undefined, 'riguarda'); d = r2.diagram;
      for (const r of [r1.id, r2.id]) {
        d = updateParticipant(d, r, 0, { min: 0, max: 'N' });
        d = updateParticipant(d, r, 1, { min: 1, max: 1 });
      }
      d = setExternalVia(d, e.id, [r1.id, r2.id]);
      return { s: buildScene(d, [], new Set()), e: e.id, rels: [r1.id, r2.id] };
    };
    const layouts: Array<[string, number, number, number, number, [number, number]?]> = [
      ['sopra a sinistra e a destra', -300, -300, 300, -300],
      ['sotto a sinistra e a destra', -300, 300, 300, 300],
      ['a sinistra e a destra', -500, 0, 500, 0],
      ['sopra e sotto', 0, -400, 0, 400],
      ['a sinistra e sopra', -500, 0, 0, -400],
      ['sopra e sotto, attributi ai lati', 0, -400, 0, 400, [Math.PI, 0]],
      ['sotto a sinistra e a destra, attributi sopra e sotto', -300, 300, 300, 300, [-Math.PI / 2, Math.PI / 2]],
    ];
    for (const [where, sx, sy, cx, cy, angles] of layouts) {
      it(`due identificanti (${where}): un arco unico che attraversa i due rami e finisce col pallino`, () => {
        const { s, e, rels } = esame(sx, sy, cx, cy, angles);
        expect(s.extIds).toHaveLength(1);
        const arc = s.extIds[0];
        expect(arc.entityId).toBe(e);
        expect([...arc.relIds].sort()).toEqual([...rels].sort());
        expect(arc.points.length).toBeGreaterThan(8);
        expect(arc.dot).toEqual(arc.points[arc.points.length - 1]);
        const box = s.entities.find((x) => x.id === e)!.box;
        // tutto fuori dall'entita', con un po' di margine
        for (const p of arc.points) expect(Math.abs(p.x - box.x) > box.w / 2 + 4 || Math.abs(p.y - box.y) > box.h / 2 + 4).toBe(true);
        // curva pulita: passi corti e niente svolte brusche
        for (let i = 1; i < arc.points.length; i++) {
          expect(Math.hypot(arc.points[i].x - arc.points[i - 1].x, arc.points[i].y - arc.points[i - 1].y)).toBeLessThan(12);
        }
        for (let i = 2; i < arc.points.length; i++) {
          const a1 = Math.atan2(arc.points[i - 1].y - arc.points[i - 2].y, arc.points[i - 1].x - arc.points[i - 2].x);
          const a2 = Math.atan2(arc.points[i].y - arc.points[i - 1].y, arc.points[i].x - arc.points[i - 1].x);
          const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
          expect(turn).toBeLessThan(0.6);
        }
        // attraversa ogni ramo identificante
        for (const rid of rels) {
          const l = s.links.find((x) => x.relId === rid && x.index === 1)!;
          const crosses = arc.points.some((p, i) => {
            if (!i) return false;
            const q = arc.points[i - 1];
            const side = (pt: { x: number; y: number }) => (l.from.x - l.to.x) * (pt.y - l.to.y) - (l.from.y - l.to.y) * (pt.x - l.to.x);
            return Math.sign(side(p)) !== Math.sign(side(q));
          });
          expect(crosses).toBe(true);
        }
        // niente sovrapposizioni con cardinalita' e attributi
        for (const p of arc.points) {
          for (const l of s.links) expect(Math.abs(p.x - l.card.x) < 18 && Math.abs(p.y - l.card.y) < 9).toBe(false);
          for (const a of s.attributes) expect(Math.hypot(a.geom.dot.x - p.x, a.geom.dot.y - p.y)).toBeGreaterThan(8);
        }
        for (const a of s.attributes) expect(Math.hypot(a.geom.dot.x - arc.dot.x, a.geom.dot.y - arc.dot.y)).toBeGreaterThan(14);
      });
    }

    it('senza chiave parziale: solo il taglietto', () => {
      const { s } = weak(400, 0, []);
      expect(s.extIds).toHaveLength(1);
      expect(s.idBars).toEqual([]);
    });
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
