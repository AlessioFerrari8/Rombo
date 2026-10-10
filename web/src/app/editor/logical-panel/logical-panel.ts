import { Component, computed, inject } from '@angular/core';
import { downloadBlob, slugify } from '../../core/download';
import { Toasts } from '../../core/toasts';
import { Table, formatLogical } from '../../domain/logical';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-logical-panel', templateUrl: './logical-panel.html' })
export class LogicalPanel {
  protected readonly store = inject(EditorStore);
  private readonly toasts = inject(Toasts);
  protected readonly text = computed(() => {
    const l = this.store.schema();
    return l ? formatLogical(l) : '';
  });

  cols(t: Table): Array<{ name: string; pk: boolean; fk: string | null; nullable: boolean }> {
    return t.columns.map((c) => ({
      name: c.name,
      pk: t.primaryKey.includes(c.name),
      fk: t.foreignKeys.find((f) => f.columns.includes(c.name))?.refTable.toUpperCase() ?? null,
      nullable: c.nullable,
    }));
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
      this.toasts.show('success', 'Schema logico copiato.');
    } catch {
      this.toasts.show('error', 'Non riesco a copiare: usa «Scarica».');
    }
  }

  download(): void {
    downloadBlob(new Blob([this.text()], { type: 'text/plain;charset=utf-8' }), `${slugify(this.store.diagram().title)}-schema.txt`);
  }
}
