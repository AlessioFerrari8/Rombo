import { Injectable, computed, inject, signal } from '@angular/core';
import { LocalDiagrams } from '../core/local-diagrams';
import { Toasts } from '../core/toasts';
import {
  Clipboard, Created, addAttribute, addAttributePart, addGeneralization, addRelationship, copyElements, createDiagram, deleteElements,
  moveElements, pasteElements, redistributeAttributes, setPositions,
} from '../domain/commands';
import {
  History, canRedo, canUndo, commit, commitPreview, initHistory, preview, redo, undo,
} from '../domain/history';
import { toLogical } from '../domain/logical';
import { Diagram, Id, Point, entityById, findPart, kindOf, relationshipById } from '../domain/model';
import { validate } from '../domain/validate';
import { computeLayout } from './layout';

export type Tool = 'select' | 'entity' | 'relationship' | 'attribute' | 'isa';
export type PanelTab = 'props' | 'problems' | 'logical' | 'sql';
export type SaveState = 'saved' | 'saving' | 'error';

@Injectable()
export class EditorStore {
  private readonly local = inject(LocalDiagrams);
  private readonly toasts = inject(Toasts);

  readonly history = signal<History>(initHistory(createDiagram()));
  readonly diagram = computed(() => this.history().present);
  readonly selection = signal<ReadonlySet<Id>>(new Set());
  readonly tool = signal<Tool>('select');
  readonly readonly = signal(false);
  readonly issues = computed(() => validate(this.diagram()));
  readonly errorCount = computed(() => this.issues().filter((i) => i.severity === 'error').length);
  readonly logical = computed(() => (this.errorCount() ? null : toLogical(this.diagram())));
  readonly canUndo = computed(() => !this.readonly() && !this.locked() && canUndo(this.history()));
  readonly canRedo = computed(() => !this.readonly() && !this.locked() && canRedo(this.history()));
  readonly saveState = signal<SaveState>('saved');
  readonly loadCount = signal(0);
  readonly focusRequest = signal<{ ids: Id[]; n: number } | null>(null);
  readonly isaDraft = signal<{ parentId: Id | null; childIds: Id[] } | null>(null);
  readonly panelTab = signal<PanelTab>('props');
  readonly layingOut = signal(false);
  /** Cresce dopo un layout automatico: il canvas riadatta la vista. */
  readonly fitRequest = signal(0);
  /** Anteprima aperta (trascinamento o layout automatico): storia e modifiche sono bloccate. */
  private readonly previewing = signal(false);
  /** Registrato dal canvas: serve all'export. */
  canvasSvg: (() => SVGSVGElement) | null = null;

  private clipboard: Clipboard | null = null;
  private dragBase: Diagram | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingSave = false;

  load(d: Diagram, opts: { readonly?: boolean } = {}): void {
    this.history.set(initHistory(d));
    this.selection.set(new Set());
    this.tool.set('select');
    this.isaDraft.set(null);
    this.readonly.set(!!opts.readonly);
    this.loadCount.update((n) => n + 1);
  }

  /** Vero durante un'anteprima (trascinamento o layout automatico): storia e modifiche restano bloccate. */
  private locked(): boolean {
    return this.previewing() || this.layingOut();
  }

  apply(fn: (d: Diagram) => Diagram): void {
    if (this.readonly() || this.locked()) return;
    const next = fn(this.diagram());
    this.history.update((h) => commit(h, next));
    this.scheduleSave();
  }

  create(fn: (d: Diagram) => Created): Id {
    let id = '';
    this.apply((d) => {
      const r = fn(d);
      id = r.id;
      return r.diagram;
    });
    if (id) this.selection.set(new Set([id]));
    return id;
  }

  beginDrag(): void {
    if (this.readonly()) return;
    this.dragBase = this.diagram();
    this.previewing.set(true);
  }

  dragTo(fn: (base: Diagram) => Diagram): void {
    const base = this.dragBase;
    if (base) this.history.update((h) => preview(h, fn(base)));
  }

  endDrag(): void {
    const base = this.dragBase;
    if (!base) return;
    this.dragBase = null;
    this.previewing.set(false);
    if (this.diagram() === base) return;
    this.history.update((h) => commitPreview(h, base));
    this.scheduleSave();
  }

  cancelDrag(): void {
    const base = this.dragBase;
    if (!base) return;
    this.dragBase = null;
    this.previewing.set(false);
    this.history.update((h) => preview(h, base));
  }

  undo(): void {
    if (this.readonly() || this.locked()) return;
    this.history.update(undo);
    this.pruneSelection();
    this.scheduleSave();
  }

  redo(): void {
    if (this.readonly() || this.locked()) return;
    this.history.update(redo);
    this.pruneSelection();
    this.scheduleSave();
  }

  select(ids: Id[], additive = false): void {
    this.selection.update((s) => new Set(additive ? [...s, ...ids] : ids));
  }

  toggleSelect(id: Id): void {
    this.selection.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  selectAll(): void {
    const d = this.diagram();
    this.selection.set(new Set([...d.entities, ...d.relationships, ...d.generalizations].map((x) => x.id)));
  }

  focus(ids: Id[]): void {
    this.selection.set(new Set(ids));
    this.focusRequest.update((r) => ({ ids, n: (r?.n ?? 0) + 1 }));
  }

  deleteSelection(): void {
    if (this.locked()) return;
    const ids = [...this.selection()];
    if (!ids.length) return;
    this.apply((d) => deleteElements(d, ids));
    this.selection.set(new Set());
  }

  copy(): void {
    if (this.selection().size) this.clipboard = copyElements(this.diagram(), this.selection());
  }

  paste(): void {
    if (this.locked()) return;
    const clip = this.clipboard;
    if (!clip || !clip.entities.length) return;
    let ids: Id[] = [];
    this.apply((d) => {
      const r = pasteElements(d, clip);
      ids = r.ids;
      return r.diagram;
    });
    this.selection.set(new Set(ids));
  }

  nudge(dx: number, dy: number): void {
    if (this.locked()) return;
    const d = this.diagram();
    const ids = [...this.selection()].filter((id) => entityById(d, id) || relationshipById(d, id));
    if (ids.length) this.apply((x) => moveElements(x, ids, dx, dy));
  }

  cancelTool(): void {
    this.tool.set('select');
    this.isaDraft.set(null);
  }

  /** R: con 2-4 entita' selezionate crea l'associazione, altrimenti attiva lo strumento. */
  relationshipShortcut(): void {
    const d = this.diagram();
    const ents = [...this.selection()].filter((id) => entityById(d, id));
    if (ents.length >= 2 && ents.length <= 4) this.create((x) => addRelationship(x, ents));
    // una sola entita': associazione ricorsiva (es. Persona «genitore di» Persona)
    else if (ents.length === 1 && this.selection().size === 1) this.create((x) => addRelationship(x, [ents[0], ents[0]]));
    else this.tool.set('relationship');
  }

  /** A: con un'entita' o associazione selezionata aggiunge l'attributo, altrimenti attiva lo strumento. */
  attributeShortcut(): void {
    const sel = [...this.selection()];
    const d = this.diagram();
    const k = sel.length === 1 ? kindOf(d, sel[0]) : null;
    if (k === 'entity' || k === 'relationship') this.create((x) => addAttribute(x, sel[0]));
    // su un attributo: una parte (diventa composto); su una parte: una parte sorella
    else if (k === 'attribute') this.create((x) => addAttributePart(x, sel[0]));
    else if (k === 'part') this.create((x) => addAttributePart(x, findPart(d, sel[0])!.attribute.id));
    else this.tool.set('attribute');
  }

  startIsa(): void {
    const d = this.diagram();
    const ents = [...this.selection()].filter((id) => entityById(d, id));
    this.tool.set('isa');
    this.isaDraft.set({ parentId: ents.length === 1 ? ents[0] : null, childIds: [] });
    this.selection.set(new Set(ents.length === 1 ? ents : []));
  }

  isaClick(id: Id): void {
    const draft = this.isaDraft() ?? { parentId: null, childIds: [] };
    let next = draft;
    if (!draft.parentId) next = { parentId: id, childIds: [] };
    else if (id !== draft.parentId) {
      next = {
        parentId: draft.parentId,
        childIds: draft.childIds.includes(id) ? draft.childIds.filter((c) => c !== id) : [...draft.childIds, id],
      };
    }
    this.isaDraft.set(next);
    this.selection.set(new Set([next.parentId!, ...next.childIds]));
  }

  finishIsa(): void {
    const draft = this.isaDraft();
    if (draft?.parentId && draft.childIds.length) {
      const parentId = draft.parentId;
      this.create((d) => addGeneralization(d, parentId, draft.childIds));
    }
    this.cancelTool();
  }

  async autoLayout(): Promise<void> {
    if (this.readonly() || this.layingOut()) return;
    const start = this.diagram();
    if (!start.entities.length) return;
    this.layingOut.set(true);
    try {
      const target = await computeLayout(start);
      if (this.diagram() !== start) return; // modificato nel frattempo: non sovrascrivo
      const final = redistributeAttributes(setPositions(start, target));
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        // apply() e' bloccato da locked() finche' layingOut() e' vero: scrivo la storia direttamente.
        this.history.update((h) => commit(h, final));
        this.scheduleSave();
      } else {
        const from = new Map<Id, Point>([...start.entities, ...start.relationships].map((e) => [e.id, e.pos]));
        this.beginDrag();
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const frame = (now: number) => {
            const t = Math.min(1, (now - t0) / 300);
            const k = 1 - Math.pow(1 - t, 3);
            const mid: Record<Id, Point> = {};
            for (const [id, p] of Object.entries(target)) {
              const a = from.get(id) ?? p;
              mid[id] = { x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k };
            }
            this.dragTo((base) => (t < 1 ? setPositions(base, mid) : final));
            if (t < 1) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        this.endDrag();
      }
      this.fitRequest.update((n) => n + 1);
    } finally {
      this.layingOut.set(false);
    }
  }

  async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (!this.pendingSave) return;
    this.pendingSave = false;
    try {
      await this.local.saveDraft(this.diagram());
      // se nel frattempo e' arrivata una nuova modifica, scheduleSave() ha gia' rimesso
      // pendingSave a true e lo stato a 'saving': non sovrascriverlo con un falso 'saved'.
      if (!this.pendingSave) this.saveState.set('saved');
    } catch {
      this.saveState.set('error');
      this.toasts.show('error', 'Non riesco a salvare in questo browser: esporta il file per non perdere il lavoro.', 10000);
    }
  }

  private scheduleSave(): void {
    this.pendingSave = true;
    this.saveState.set('saving');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 500);
  }

  private pruneSelection(): void {
    const d = this.diagram();
    this.selection.update((s) => new Set([...s].filter((id) => kindOf(d, id) !== null)));
  }
}
