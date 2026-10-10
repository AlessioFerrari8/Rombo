import { addEntity, createDiagram, deleteElements } from './commands';
import { HISTORY_LIMIT, canRedo, canUndo, commit, commitPreview, initHistory, preview, redo, undo } from './history';

describe('history', () => {
  it('annulla e ripete', () => {
    const d0 = createDiagram();
    const d1 = addEntity(d0, { x: 0, y: 0 }).diagram;
    let h = commit(initHistory(d0), d1);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(d0);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(d1);
  });

  it('un nuovo comando cancella il futuro', () => {
    const d0 = createDiagram();
    const d1 = addEntity(d0, { x: 0, y: 0 }).diagram;
    const d2 = addEntity(d0, { x: 5, y: 5 }).diagram;
    const h = commit(undo(commit(initHistory(d0), d1)), d2);
    expect(canRedo(h)).toBe(false);
  });

  it("l'undo rimette un'entita cancellata con i suoi legami", () => {
    const d0 = addEntity(createDiagram(), { x: 0, y: 0 }, 'Auto').diagram;
    const h = commit(initHistory(d0), deleteElements(d0, [d0.entities[0].id]));
    expect(undo(h).present.entities[0].name).toBe('Auto');
  });

  it('un trascinamento e un solo passo di storico', () => {
    const d0 = createDiagram();
    let h = initHistory(d0);
    const base = h.present;
    h = preview(h, addEntity(base, { x: 1, y: 1 }).diagram);
    h = preview(h, addEntity(base, { x: 2, y: 2 }).diagram);
    h = commitPreview(h, base);
    expect(h.past).toEqual([base]);
    expect(undo(h).present).toBe(base);
  });

  it(`tiene al massimo ${HISTORY_LIMIT} passi`, () => {
    let d = createDiagram();
    let h = initHistory(d);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      d = addEntity(d, { x: i, y: 0 }).diagram;
      h = commit(h, d);
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
