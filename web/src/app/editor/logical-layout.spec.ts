import { buildCarrozzeria } from '../domain/fixtures/carrozzeria';
import { buildNegozio } from '../domain/fixtures/logical';
import { GRID } from '../domain/geometry';
import { generateLogical } from '../domain/logical-schema';
import { tableRect } from '../domain/logical-geometry';
import { setTablePositions } from '../domain/logical-commands';
import { computeLogicalLayout } from './logical-layout';

describe('computeLogicalLayout', () => {
  it('da una posizione a ogni tabella, sulla griglia e senza sovrapposizioni', async () => {
    const l = generateLogical(buildCarrozzeria());
    const pos = await computeLogicalLayout(l);
    expect(Object.keys(pos)).toHaveLength(l.tables.length);
    for (const p of Object.values(pos)) {
      expect(p.x % GRID).toBe(0);
      expect(p.y % GRID).toBe(0);
    }
    const placed = l.tables.map((t) => ({ ...t, pos: pos[t.id] }));
    const rects = placed.map(tableRect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    }
  });

  it('mette la tabella che riferisce a sinistra di quella riferita', async () => {
    const { d, cliente, ordine } = buildNegozio();
    const pos = await computeLogicalLayout(d.logical!);
    expect(pos[ordine].x).toBeLessThan(pos[cliente].x);
    expect(setTablePositions(d, pos).logical!.tables).toHaveLength(2);
  });

  it('uno schema vuoto da un layout vuoto', async () => {
    expect(await computeLogicalLayout({ tables: [] })).toEqual({});
  });
});
