import { Component, inject } from '@angular/core';
import { downloadBlob, slugify } from '../../core/download';
import { toDDL } from '../../domain/ddl';
import { formatLogical } from '../../domain/logical';
import { EditorStore } from '../editor-store';

/** Interruttore ER / Logico della barra in alto (solo nell'edizione completa). */
@Component({
  selector: 'app-mode-switch',
  host: { class: 'contents' },
  template: `
    <div class="ui-segmented" role="group" aria-label="Tipo di diagramma">
      <button type="button" class="ui-segment" [class.is-active]="store.mode() === 'er'" [attr.aria-pressed]="store.mode() === 'er'" (click)="store.setMode('er')">ER</button>
      <button type="button" class="ui-segment" [class.is-active]="store.mode() === 'logical'" [attr.aria-pressed]="store.mode() === 'logical'" (click)="store.setMode('logical')">Logico</button>
    </div>
  `,
})
export class ModeSwitch {
  protected readonly store = inject(EditorStore);
}

/** Voci «Schema» del menu Esporta: schema logico e SQL. */
@Component({
  selector: 'app-logical-export-items',
  host: { class: 'contents' },
  template: `
    <li class="ui-menu-title">Schema</li>
    <li>
      <button type="button" class="ui-menu-item" [disabled]="!store.schema()" (click)="exportText('logical')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
        Schema logico (.txt)
      </button>
    </li>
    <li>
      <button type="button" class="ui-menu-item" [disabled]="!store.schema()" (click)="exportText('postgres')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" /></svg>
        SQL PostgreSQL
      </button>
    </li>
    <li>
      <button type="button" class="ui-menu-item" [disabled]="!store.schema()" (click)="exportText('mysql')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" /></svg>
        SQL MySQL
      </button>
    </li>
  `,
})
export class LogicalExportItems {
  protected readonly store = inject(EditorStore);

  exportText(kind: 'logical' | 'postgres' | 'mysql'): void {
    const l = this.store.schema();
    if (!l) return;
    const base = slugify(this.store.diagram().title);
    if (kind === 'logical') downloadBlob(new Blob([formatLogical(l)], { type: 'text/plain;charset=utf-8' }), `${base}-schema.txt`);
    else downloadBlob(new Blob([toDDL(l, kind)], { type: 'application/sql' }), `${base}-${kind}.sql`);
  }
}

/** Sotto «Nessun problema»: il passo successivo, cioe' lo schema logico. */
@Component({
  selector: 'app-logical-ready',
  host: { class: 'contents' },
  template: `
    <p class="text-sm text-ink-2">{{ store.mode() === 'logical' ? 'Lo schema logico è pronto per l\\'esportazione.' : 'Il diagramma è pronto per lo schema logico.' }}</p>
    <button type="button" class="ui-btn ui-btn-primary ui-btn-sm mt-2" (click)="store.panelTab.set('logical')">Vedi lo schema logico</button>
  `,
})
export class LogicalReady {
  protected readonly store = inject(EditorStore);
}
