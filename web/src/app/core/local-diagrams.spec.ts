import { TestBed } from '@angular/core/testing';
import { createDiagram } from '../domain/commands';
import { LocalDiagrams } from './local-diagrams';

describe('LocalDiagrams', () => {
  it('salva una bozza, la rilegge e la segna da sincronizzare', async () => {
    const local = TestBed.inject(LocalDiagrams);
    const d = createDiagram('Bozza');
    await local.saveDraft(d);
    const rec = await local.get(d.id);
    expect(rec).toMatchObject({ id: d.id, dirty: true, serverVersion: null });
    expect(rec!.diagram.title).toBe('Bozza');
    expect((await local.list()).some((r) => r.id === d.id)).toBe(true);
  });

  it("all'uscita tiene solo quello che il server non ha", async () => {
    const local = TestBed.inject(LocalDiagrams);
    const synced = createDiagram('Sul server');
    const pending = createDiagram('Modificato offline');
    const onlyHere = createDiagram('Mai caricato');
    await local.put({ id: synced.id, diagram: synced, serverVersion: 3, dirty: false, updatedAt: 1 });
    await local.put({ id: pending.id, diagram: pending, serverVersion: 3, dirty: true, updatedAt: 2 });
    await local.saveDraft(onlyHere);
    expect(await local.removeSynced()).toBe(1);
    expect(await local.get(synced.id)).toBeUndefined();
    expect(await local.get(pending.id)).toBeDefined();
    expect(await local.get(onlyHere.id)).toBeDefined();
  });
});
