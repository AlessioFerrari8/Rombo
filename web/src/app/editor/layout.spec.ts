import { buildCarrozzeria } from '../domain/fixtures/carrozzeria';
import { entityBox, relBox } from '../domain/geometry';
import { setPositions } from '../domain/commands';
import { computeLayout } from './layout';

describe('computeLayout', () => {
  it('posiziona tutto senza sovrapposizioni', async () => {
    const d = buildCarrozzeria();
    const pos = await computeLayout(d);
    expect(Object.keys(pos)).toHaveLength(7);
    const placed = setPositions(d, pos);
    const boxes = [...placed.entities.map(entityBox), ...placed.relationships.map(relBox)];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
        expect(overlap).toBe(false);
      }
    }
  });
});
