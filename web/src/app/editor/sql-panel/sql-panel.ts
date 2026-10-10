import { Component, computed, inject, signal } from '@angular/core';
import { downloadBlob, slugify } from '../../core/download';
import { Toasts } from '../../core/toasts';
import { Dialect, toDDL } from '../../domain/ddl';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-sql-panel', templateUrl: './sql-panel.html' })
export class SqlPanel {
  protected readonly store = inject(EditorStore);
  private readonly toasts = inject(Toasts);
  protected readonly dialect = signal<Dialect>('postgres');
  protected readonly sql = computed(() => {
    const l = this.store.logical();
    return l ? toDDL(l, this.dialect()) : null;
  });

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.sql() ?? '');
      this.toasts.show('success', 'SQL copiato.');
    } catch {
      this.toasts.show('error', 'Non riesco a copiare: usa «Scarica».');
    }
  }

  download(): void {
    const sql = this.sql();
    if (sql) downloadBlob(new Blob([sql], { type: 'application/sql' }), `${slugify(this.store.diagram().title)}-${this.dialect()}.sql`);
  }
}
