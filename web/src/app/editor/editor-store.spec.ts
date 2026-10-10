import { TestBed } from '@angular/core/testing';
import { addAttribute, addEntity, createDiagram, moveElements } from '../domain/commands';
import { buildCarrozzeria } from '../domain/fixtures/carrozzeria';
import { LocalDiagrams } from '../core/local-diagrams';
import { EditorStore } from './editor-store';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  return TestBed.inject(EditorStore);
}

describe('EditorStore', () => {
  it('applica, annulla e ripete', () => {
    const s = setup();
    s.load(createDiagram());
    const id = s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Auto'));
    expect(s.diagram().entities).toHaveLength(1);
    expect([...s.selection()]).toEqual([id]);
    s.undo();
    expect(s.diagram().entities).toHaveLength(0);
    s.redo();
    expect(s.diagram().entities[0].name).toBe('Auto');
  });

  it('un trascinamento e un solo passo di storico; annullato non lascia traccia', () => {
    const s = setup();
    s.load(createDiagram());
    const id = s.create((d) => addEntity(d, { x: 0, y: 0 }));
    s.beginDrag();
    s.dragTo((b) => moveElements(b, [id], 16, 0));
    s.dragTo((b) => moveElements(b, [id], 32, 0));
    s.endDrag();
    expect(s.diagram().entities[0].pos.x).toBe(32);
    s.undo();
    expect(s.diagram().entities[0].pos.x).toBe(0);
    s.beginDrag();
    s.dragTo((b) => moveElements(b, [id], 99, 0));
    s.cancelDrag();
    expect(s.diagram().entities[0].pos.x).toBe(0);
    expect(s.canRedo()).toBe(true);
  });

  it('lo schema logico esiste solo senza errori', () => {
    const s = setup();
    s.load(buildCarrozzeria());
    expect(s.logical()!.tables).toHaveLength(5);
    s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Senza chiave'));
    expect(s.errorCount()).toBe(1);
    expect(s.logical()).toBeNull();
  });

  it('in sola lettura non cambia niente', () => {
    const s = setup();
    s.load(createDiagram(), { readonly: true });
    s.apply((d) => addEntity(d, { x: 0, y: 0 }).diagram);
    expect(s.diagram().entities).toHaveLength(0);
  });

  it('copia, incolla e seleziona la copia; cancella la selezione', () => {
    const s = setup();
    s.load(createDiagram());
    s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Auto'));
    s.copy();
    s.paste();
    expect(s.diagram().entities.map((e) => e.name)).toEqual(['Auto', 'Auto 2']);
    expect(s.selection().size).toBe(1);
    s.deleteSelection();
    expect(s.diagram().entities.map((e) => e.name)).toEqual(['Auto']);
    expect(s.selection().size).toBe(0);
  });

  it("R con una sola entita' selezionata crea un'associazione ricorsiva", () => {
    const s = setup();
    s.load(createDiagram());
    const id = s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Persona'));
    s.relationshipShortcut();
    const r = s.diagram().relationships;
    expect(r).toHaveLength(1);
    expect(r[0].participants.map((p) => p.entityId)).toEqual([id, id]);
    expect([...s.selection()]).toEqual([r[0].id]);
  });

  it("A su un attributo gli aggiunge una parte (diventa composto); A su una parte ne aggiunge un'altra", () => {
    const s = setup();
    s.load(createDiagram());
    const e = s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Studente'));
    const ind = s.create((d) => addAttribute(d, e, 'indirizzo'));
    s.attributeShortcut();
    const first = [...s.selection()][0];
    s.attributeShortcut();
    const a = s.diagram().entities[0].attributes[0];
    expect(a.parts!.map((p) => p.name)).toEqual(['parte', 'parte 2']);
    expect(a.id).toBe(ind);
    expect(a.parts![0].id).toBe(first);
  });

  it('la IS-A si costruisce cliccando padre e figli', () => {
    const s = setup();
    s.load(createDiagram());
    const p = s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Dipendente'));
    const c = s.create((d) => addEntity(d, { x: 0, y: 200 }, 'Meccanico'));
    s.select([]);
    s.startIsa();
    s.isaClick(p);
    s.isaClick(c);
    s.finishIsa();
    expect(s.diagram().generalizations).toEqual([expect.objectContaining({ parentId: p, childIds: [c] })]);
    expect(s.tool()).toBe('select');
  });

  it('salva la bozza in IndexedDB', async () => {
    const s = setup();
    const d = createDiagram('Salvami');
    s.load(d);
    s.create((x) => addEntity(x, { x: 0, y: 0 }));
    await s.flush();
    const rec = await TestBed.inject(LocalDiagrams).get(d.id);
    expect(rec!.diagram.entities).toHaveLength(1);
    expect(s.saveState()).toBe('saved');
  });

  it('un salvataggio in corso non nasconde una modifica arrivata nel frattempo', async () => {
    const s = setup();
    const local = TestBed.inject(LocalDiagrams);
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const spy = vi.spyOn(local, 'saveDraft').mockReturnValueOnce(firstSave);

    const d = createDiagram('Corsa');
    s.load(d);
    s.create((x) => addEntity(x, { x: 0, y: 0 }, 'Uno'));
    const flushed = s.flush();

    // arriva una modifica mentre il primo salvataggio e' ancora in corso
    // (scheduleSave riarma un timer reale a 500ms, che il flush manuale piu' sotto cancella)
    s.create((x) => addEntity(x, { x: 100, y: 0 }, 'Due'));
    expect(s.saveState()).toBe('saving');

    resolveFirst();
    await flushed;

    // il salvataggio concluso non deve dichiarare "saved": la modifica piu' recente non e' ancora su disco
    expect(s.saveState()).toBe('saving');

    spy.mockRestore();
    await s.flush();
    expect(s.saveState()).toBe('saved');
    const rec = await local.get(d.id);
    expect(rec!.diagram.entities.map((e) => e.name)).toEqual(['Uno', 'Due']);
  });

  it('durante un trascinamento aperto, undo() non tocca la storia', () => {
    const s = setup();
    s.load(createDiagram());
    const id = s.create((d) => addEntity(d, { x: 0, y: 0 }));
    s.beginDrag();
    s.dragTo((b) => moveElements(b, [id], 16, 0));
    const h = s.history();
    expect(s.canUndo()).toBe(false);
    s.undo();
    expect(s.history()).toBe(h);
    expect(s.diagram().entities[0].pos.x).toBe(16);
    s.cancelDrag();
  });

  it('durante un trascinamento aperto, apply()/create() non fanno nulla; endDrag registra un solo passo', () => {
    const s = setup();
    s.load(createDiagram());
    const id = s.create((d) => addEntity(d, { x: 0, y: 0 }));
    const pastBefore = s.history().past.length;
    s.beginDrag();
    s.dragTo((b) => moveElements(b, [id], 16, 0));
    const mid = s.diagram();
    const intruderId = s.create((d) => addEntity(d, { x: 100, y: 100 }, 'Intruso'));
    expect(intruderId).toBe('');
    expect(s.diagram()).toBe(mid);
    expect(s.diagram().entities).toHaveLength(1);
    s.dragTo((b) => moveElements(b, [id], 32, 0));
    s.endDrag();
    expect(s.diagram().entities).toHaveLength(1);
    expect(s.diagram().entities[0].pos.x).toBe(32);
    expect(s.history().past.length).toBe(pastBefore + 1);
  });

  it('autoLayout blocca undo e modifiche finche non finisce; un solo undo dopo torna al punto di partenza', async () => {
    const s = setup();
    s.load(buildCarrozzeria());
    const before = s.diagram();
    const pastBefore = s.history().past.length;

    const p = s.autoLayout();
    expect(s.layingOut()).toBe(true);
    expect(s.canUndo()).toBe(false);

    s.undo();
    expect(s.diagram()).toBe(before);

    const intruderId = s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Intruso'));
    expect(intruderId).toBe('');
    expect(s.diagram()).toBe(before);

    await p;

    expect(s.layingOut()).toBe(false);
    expect(s.diagram().entities.map((e) => e.name)).not.toContain('Intruso');
    expect(s.diagram()).not.toBe(before);
    expect(s.history().past.length).toBe(pastBefore + 1);

    s.undo();
    expect(s.diagram()).toBe(before);
  });

  it('autoLayout con prefers-reduced-motion applica il risultato subito e resta annullabile in un colpo solo', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') }) as unknown as MediaQueryList);
    try {
      const s = setup();
      s.load(buildCarrozzeria());
      const before = s.diagram();
      const beforePos = [...before.entities, ...before.relationships].map((e) => ({ id: e.id, pos: e.pos }));
      const pastBefore = s.history().past.length;

      await s.autoLayout();

      expect(s.layingOut()).toBe(false);
      const after = s.diagram();
      const afterPos = [...after.entities, ...after.relationships].map((e) => ({ id: e.id, pos: e.pos }));
      expect(afterPos).not.toEqual(beforePos);
      expect(s.history().past.length).toBe(pastBefore + 1);

      s.undo();
      expect(s.diagram()).toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
