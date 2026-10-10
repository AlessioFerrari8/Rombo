import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  addColumn, addForeignKey, addTable, checkForeignKey, deleteColumn, deleteForeignKey, deleteTables, moveColumn, removeUnique,
  renameTable, setForeignKeyColumns, toggleUnique, togglePrimaryKey, updateColumn,
} from '../../domain/logical-commands';
import { Id, LForeignKey, LTable, findForeignKey, tableById } from '../../domain/model';
import { EditorStore } from '../editor-store';
import { TypePicker } from '../type-picker/type-picker';

@Component({ selector: 'app-logical-properties', templateUrl: './logical-properties.html', imports: [TypePicker] })
export class LogicalProperties {
  protected readonly store = inject(EditorStore);
  protected readonly ro = computed(() => this.store.readonly());
  protected readonly tables = computed(() => this.store.diagram().logical?.tables ?? []);
  /** La tabella selezionata, o quella della FK selezionata. */
  protected readonly table = computed<LTable | undefined>(() => {
    const d = this.store.diagram();
    for (const id of this.store.selection()) {
      const t = tableById(d, id) ?? findForeignKey(d, id)?.table;
      if (t) return t;
    }
    return undefined;
  });
  protected readonly selectedFk = computed<Id | undefined>(() => {
    const d = this.store.diagram();
    return [...this.store.selection()].find((id) => findForeignKey(d, id));
  });

  // bozza della nuova chiave esterna
  protected readonly draftRef = signal<Id | ''>('');
  protected readonly draftCols = signal<Array<Id | ''>>([]);
  protected readonly refPk = computed(() => {
    const r = tableById(this.store.diagram(), this.draftRef());
    return r ? r.primaryKey.map((id) => r.columns.find((c) => c.id === id)!).filter(Boolean) : [];
  });
  protected readonly draftError = computed(() => {
    const t = this.table();
    const ref = this.draftRef();
    if (!t || !ref) return null;
    return checkForeignKey(this.store.diagram(), t.id, this.draftCols().filter((c): c is Id => !!c), ref);
  });

  /** Solo l'id: la bozza si azzera cambiando tabella, non a ogni modifica di quella aperta. */
  private readonly tableId = computed(() => this.table()?.id);

  constructor() {
    effect(() => {
      this.tableId();
      untracked(() => {
        this.draftRef.set('');
        this.draftCols.set([]);
      });
    });
  }

  newTable(): void {
    const id = this.store.create((d) => addTable(d, { x: 32, y: 32 }));
    this.store.focus([id]);
  }

  pick(id: Id): void {
    this.store.select([id]);
  }

  renameTable(t: LTable, name: string): void {
    this.store.apply((d) => renameTable(d, t.id, name));
  }

  removeTable(t: LTable): void {
    this.store.apply((d) => deleteTables(d, [t.id]));
    this.store.selection.set(new Set());
  }

  addCol(t: LTable): void {
    this.store.apply((d) => addColumn(d, t.id).diagram);
  }

  rename(t: LTable, colId: Id, name: string): void {
    this.store.apply((d) => updateColumn(d, t.id, colId, { name }));
  }

  setType(t: LTable, colId: Id, type: string): void {
    this.store.apply((d) => updateColumn(d, t.id, colId, { type }));
  }

  setNullable(t: LTable, colId: Id, nullable: boolean): void {
    this.store.apply((d) => updateColumn(d, t.id, colId, { nullable }));
  }

  togglePk(t: LTable, colId: Id): void {
    this.store.apply((d) => togglePrimaryKey(d, t.id, colId));
  }

  toggleUq(t: LTable, colId: Id): void {
    this.store.apply((d) => toggleUnique(d, t.id, colId));
  }

  isUnique(t: LTable, colId: Id): boolean {
    return t.uniques.some((u) => u.length === 1 && u[0] === colId);
  }

  compositeUniques(t: LTable): Array<{ index: number; label: string }> {
    return t.uniques
      .map((u, index) => ({ index, u }))
      .filter((x) => x.u.length > 1)
      .map((x) => ({ index: x.index, label: x.u.map((id) => t.columns.find((c) => c.id === id)?.name ?? '?').join(', ') }));
  }

  removeUq(t: LTable, index: number): void {
    this.store.apply((d) => removeUnique(d, t.id, index));
  }

  move(t: LTable, colId: Id, delta: -1 | 1): void {
    this.store.apply((d) => moveColumn(d, t.id, colId, delta));
  }

  removeCol(t: LTable, colId: Id): void {
    this.store.apply((d) => deleteColumn(d, t.id, colId));
  }

  // --- chiavi esterne ---
  fkLabel(t: LTable, f: LForeignKey): string {
    const r = this.tables().find((x) => x.id === f.refTableId);
    const cols = f.columnIds.map((id) => t.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
    const refs = f.refColumnIds.map((id) => r?.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
    return `(${cols}) → ${r?.name ?? '?'}(${refs})`;
  }

  selectFk(id: Id): void {
    this.store.select([id]);
  }

  removeFk(t: LTable, id: Id): void {
    this.store.apply((d) => deleteForeignKey(d, t.id, id));
  }

  setFkColumn(t: LTable, f: LForeignKey, position: number, colId: Id): void {
    const next = f.columnIds.map((c, i) => (i === position ? colId : c));
    this.store.apply((d) => setForeignKeyColumns(d, t.id, f.id, next));
  }

  pickRef(id: string): void {
    this.draftRef.set(id);
    this.draftCols.set(this.refPk().map(() => ''));
  }

  pickDraftCol(position: number, colId: string): void {
    this.draftCols.update((cols) => cols.map((c, i) => (i === position ? colId : c)));
  }

  canAddFk(): boolean {
    return !!this.draftRef() && this.draftCols().every((c) => !!c) && this.draftCols().length > 0 && !this.draftError();
  }

  addFk(t: LTable): void {
    const cols = this.draftCols().filter((c): c is Id => !!c);
    const ref = this.draftRef();
    if (!ref || this.draftError()) return;
    this.store.create((d) => addForeignKey(d, t.id, cols, ref));
    this.draftRef.set('');
    this.draftCols.set([]);
  }
}
