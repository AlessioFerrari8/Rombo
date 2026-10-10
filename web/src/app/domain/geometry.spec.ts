import { addAttribute, addEntity, createDiagram } from './commands';
import {
  ATTR_STICK, attributeGeometry, compositeGeometry, diagramBounds, entityBox, participantGeometry, rectBorder, relBox, rhombusBorder,
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
