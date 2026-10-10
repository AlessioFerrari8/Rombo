import { MAX_ZOOM, centerOn, fitView, screenToWorld, worldToScreen, zoomAt } from './viewport';

describe('viewport', () => {
  it('lo zoom tiene fermo il punto sotto il mouse', () => {
    const v = { x: 30, y: -10, zoom: 1 };
    const p = { x: 200, y: 150 };
    const before = screenToWorld(v, p);
    const after = screenToWorld(zoomAt(v, 1.7, p), p);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('lo zoom ha dei limiti', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 2.9 }, 10, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it('adatta e centra il contenuto', () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, 800, 600);
    const c = worldToScreen(v, { x: 100, y: 50 });
    expect(c.x).toBeCloseTo(400);
    expect(c.y).toBeCloseTo(300);
    expect(fitView(null, 800, 600)).toEqual({ x: 400, y: 300, zoom: 1 });
  });

  it('nelle anteprime un diagramma alto sta tutto nel riquadro, anche sotto lo zoom minimo', () => {
    const b = { minX: 0, minY: 0, maxX: 700, maxY: 1900 };
    const v = fitView(b, 360, 176, 8, 0);
    expect(worldToScreen(v, { x: b.minX, y: b.minY }).y).toBeGreaterThanOrEqual(0);
    expect(worldToScreen(v, { x: b.maxX, y: b.maxY }).y).toBeLessThanOrEqual(176);
  });

  it('centra senza cambiare zoom', () => {
    const v = centerOn({ x: 0, y: 0, zoom: 2 }, { minX: 10, minY: 10, maxX: 30, maxY: 30 }, 400, 400);
    expect(v.zoom).toBe(2);
    expect(worldToScreen(v, { x: 20, y: 20 })).toEqual({ x: 200, y: 200 });
  });
});
