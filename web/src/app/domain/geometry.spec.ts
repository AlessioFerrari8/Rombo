import { addAttribute, addEntity, createDiagram } from './commands';
import {
  ATTR_STICK, attributeGeometry, compositeGeometry, diagramBounds, entityBox, participantGeometry, rectBorder, relBox, rhombusBorder, snapAngle,
} from './geometry';

const box = { x: 0, y: 0, w: 120, h: 56 };

describe('geometria', () => {
  it("la larghezza dell'entita cresce col nome, con un minimo", () => {
    expect(entityBox({ pos: { x: 0, y: 0 }, name: 'A' }).w).toBe(120);
    expect(entityBox({ pos: { x: 0, y: 0 }, name: 'Un nome davvero molto lungo' }).w).toBeGreaterThan(200);
    expect(relBox({ pos: { x: 0, y: 0 }, name: 'fa' }).w).toBe(100);
  });

  it('trova il bordo del rettangolo e del rombo', () => {
    expect(rectBorder(box, 0)).toEqual({ x: 60, y: 0 });
    const down = rectBorder(box, Math.PI / 2);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(28);
    expect(rectBorder(box, Math.PI / 4).y).toBeCloseTo(28);
    const r = rhombusBorder({ x: 0, y: 0, w: 100, h: 64 }, 0);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(0);
  });

  it("l'attributo in alto ha l'etichetta centrata sopra, quello a destra allineata a sinistra", () => {
    const top = attributeGeometry(box, 'rect', -Math.PI / 2);
    expect(top.dot.y).toBeCloseTo(-28 - ATTR_STICK);
    expect(top.anchor).toBe('middle');
    expect(top.label.y).toBeLessThan(top.dot.y);
    expect(attributeGeometry(box, 'rect', 0).anchor).toBe('start');
    expect(attributeGeometry(box, 'rect', Math.PI).anchor).toBe('end');
  });

  it('la cardinalita sta vicino al bordo della entita', () => {
    const g = participantGeometry({ x: 0, y: 0, w: 100, h: 64 }, { x: 300, y: 0, w: 120, h: 56 });
    expect(g.from.x).toBeCloseTo(50);
    expect(g.to.x).toBeCloseTo(240);
    expect(Math.hypot(g.card.x - g.to.x, g.card.y - g.to.y)).toBeCloseTo(Math.hypot(22, 12));
  });

  describe('linee rombo-entità dritte', () => {
    const rel = (x: number, y: number) => ({ x, y, w: 100, h: 64 });
    const ent = (x: number, y: number) => ({ x, y, w: 120, h: 56 });

    it('quasi in colonna: linea perfettamente verticale dal vertice del rombo al lato dell entità', () => {
      const g = participantGeometry(rel(13, 0), ent(0, 200));
      expect(g.points).toHaveLength(2);
      expect(g.from).toEqual({ x: 13, y: 32 });
      expect(g.to).toEqual({ x: 13, y: 172 });
      // anche verso l'alto
      const up = participantGeometry(rel(-20, 300), ent(0, 0));
      expect(up.from).toEqual({ x: -20, y: 268 });
      expect(up.to).toEqual({ x: -20, y: 28 });
    });

    it('quasi in riga: linea perfettamente orizzontale', () => {
      const g = participantGeometry(rel(0, 6), ent(300, 0));
      expect(g.from).toEqual({ x: 50, y: 6 });
      expect(g.to).toEqual({ x: 240, y: 6 });
      const left = participantGeometry(rel(400, -10), ent(0, 0));
      expect(left.from).toEqual({ x: 350, y: -10 });
      expect(left.to).toEqual({ x: 60, y: -10 });
    });

    it('in diagonale: un solo segmento sulla retta centro-centro, coi capi sui bordi', () => {
      const r = rel(0, 0);
      const e = ent(300, 200);
      const g = participantGeometry(r, e);
      expect(g.points).toHaveLength(2);
      const cross = (p: { x: number; y: number }) => (e.x - r.x) * (p.y - r.y) - (e.y - r.y) * (p.x - r.x);
      expect(cross(g.from)).toBeCloseTo(0, 6);
      expect(cross(g.to)).toBeCloseTo(0, 6);
      // da sul bordo del rombo, a sul bordo del rettangolo
      expect(Math.abs(g.from.x) / 50 + Math.abs(g.from.y) / 32).toBeCloseTo(1, 6);
      expect(Math.max(Math.abs(g.to.x - e.x) / 60, Math.abs(g.to.y - e.y) / 28)).toBeCloseTo(1, 6);
    });

    it("se l'allineamento cadrebbe sull'angolo arrotondato resta la retta centro-centro", () => {
      const g = participantGeometry(rel(55, 0), ent(0, 200));
      expect(g.from.x).not.toBeCloseTo(g.to.x, 1);
    });

    it('la cardinalita non tocca una linea verticale', () => {
      const g = participantGeometry(rel(0, 0), ent(0, 200));
      // «(1,N)» e' largo circa 32px: centro ad almeno 20px dalla linea
      expect(Math.abs(g.card.x - g.to.x)).toBeGreaterThanOrEqual(20);
    });
  });

  it("snapAngle raddrizza le aste quasi orizzontali o verticali e lascia stare le altre", () => {
    expect(snapAngle(1.57)).toBe(Math.PI / 2);
    expect(snapAngle(-1.62)).toBe(-Math.PI / 2);
    expect(snapAngle(0.05)).toBe(0);
    expect(Math.abs(snapAngle(3.1))).toBe(Math.PI);
    expect(snapAngle(0.6)).toBe(0.6);
  });

  it('i limiti del diagramma comprendono le etichette degli attributi', () => {
    expect(diagramBounds(createDiagram())).toBeNull();
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Auto'); d = e.diagram;
    d = addAttribute(d, e.id, 'Targa').diagram;
    const b = diagramBounds(d)!;
    expect(b.minY).toBeLessThan(-28 - ATTR_STICK);
    expect(b.maxX).toBeGreaterThanOrEqual(60);
  });

  it("le parti di un composto si leggono dall'alto in basso (o da sinistra a destra), da qualunque lato stia", () => {
    const box = { x: 0, y: 0, w: 120, h: 56 };
    for (const angle of [Math.PI, 0]) {
      const ys = compositeGeometry(box, 'rect', angle, 'indirizzo', 3).parts.map((p) => p.dot.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    }
    for (const angle of [Math.PI / 2, -Math.PI / 2]) {
      const xs = compositeGeometry(box, 'rect', angle, 'indirizzo', 3).parts.map((p) => p.dot.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    }
  });
});
