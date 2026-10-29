import { Component, computed, inject, signal } from '@angular/core';
import { downloadBlob, slugify } from '../../core/download';
import { Toasts } from '../../core/toasts';
import { docsToMarkdown, logicalToText, parseLogicalText, setDocs, tableColors } from '../../domain/doc-text';
import { toLogical } from '../../domain/logical';
import { DOCS_ANALYSIS_MAX, DOCS_LOGICAL_MAX, Docs } from '../../domain/model';
import { EditorStore } from '../editor-store';

const DEBOUNCE_MS = 700;

/** Testo che si scrive nel pannello e finisce nel diagramma (un passo di undo ogni pausa o uscita dal campo). */
abstract class DocField {
  protected readonly store = inject(EditorStore);
  protected readonly toasts = inject(Toasts);
  protected abstract readonly key: keyof Docs;
  private readonly draft = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly text = computed(() => this.draft() ?? this.store.diagram().docs?.[this.key] ?? '');

  protected onInput(value: string): void {
    this.draft.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  protected flush(): void {
    clearTimeout(this.timer);
    const value = this.draft();
    if (value === null) return;
    this.draft.set(null);
    try {
      this.store.apply((d) => setDocs(d, { [this.key]: value }));
    } catch (e) {
      this.toasts.show('error', e instanceof Error ? e.message : 'Testo non valido.');
    }
  }

  protected replace(value: string): void {
    clearTimeout(this.timer);
    this.draft.set(null);
    this.store.apply((d) => setDocs(d, { [this.key]: value }));
  }

  protected async copy(what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
      this.toasts.show('success', `${what} copiato.`);
    } catch {
      this.toasts.show('error', 'Non riesco a copiare: usa «Scarica».');
    }
  }
}

const ICON_COPY = '<svg viewBox="0 0 24 24" class="size-4 text-ink-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24" class="size-4 text-ink-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>';

/** Modello logico in notazione testuale: TABELLA(_chiave_, campo→ALTRA, opzionale*), con le chiavi esterne colorate. */
@Component({
  selector: 'app-model-text',
  template: `
    <section class="ui-panel-body gap-3" aria-label="Modello logico">
      <div class="flex flex-wrap gap-2">
        @if (confirming()) {
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" (click)="regenerate(true)">Sì, sostituisci</button>
          <button type="button" class="ui-btn ui-btn-sm" (click)="confirming.set(false)">Annulla</button>
        } @else {
          <button type="button" class="ui-btn ui-btn-sm" [disabled]="store.activeErrorCount() > 0" [title]="store.activeErrorCount() ? 'Correggi prima gli errori del diagramma' : ''" (click)="regenerate(false)">Ricava dall'ER</button>
          <button type="button" class="ui-btn ui-btn-sm" (click)="copy('Modello logico')"><span [innerHTML]="copyIcon"></span>Copia</button>
          <button type="button" class="ui-btn ui-btn-sm" (click)="download()"><span [innerHTML]="downIcon"></span>Scarica .txt</button>
        }
      </div>
      @if (confirming()) {
        <p class="ui-hint">Il testo che hai scritto verrà sostituito (puoi annullare con Ctrl+Z).</p>
      }
      <label class="ui-label" for="model-text">Testo</label>
      <textarea id="model-text" class="ui-input min-h-48 font-mono text-[0.8125rem] leading-relaxed" rows="10" spellcheck="false"
        [value]="text()" [maxLength]="max" (input)="onInput($any($event.target).value)" (blur)="flush()"
        placeholder="STUDENTE(_IdStudente_, Nome, fkCasa→CASA)"></textarea>
      <p class="ui-hint">_x_ chiave primaria · x→TABELLA chiave esterna · x* può essere NULL · // commento</p>
      @if (tables().length) {
        <ul class="ui-list font-mono text-[0.8125rem]" aria-label="Anteprima">
          @for (l of lines(); track $index) {
            @if (l.kind === 'table') {
              <li class="ui-row block leading-relaxed break-words" [attr.data-table]="l.table">
                <span class="font-bold" [style.color]="colorOf(l.table)">{{ l.table }}</span><span class="text-ink-3">(</span>@for (c of l.columns; track $index; let last = $last) {<span class="decoration-2 underline-offset-3" [class.underline]="c.pk || !!c.fk" [class.font-bold]="c.pk" [style.color]="c.fk ? colorOf(c.fk) : c.pk && referenced().has(l.table.toUpperCase()) ? colorOf(l.table) : null">{{ c.name }}</span>@if (c.nullable) {<span class="text-ink-3">*</span>}@if (!last) {<span class="text-ink-3">, </span>}}<span class="text-ink-3">)</span>
              </li>
            } @else if (l.text.trim()) {
              <li class="ui-row block text-ink-3">{{ l.text }}</li>
            }
          }
        </ul>
      }
    </section>
  `,
})
export class ModelText extends DocField {
  protected readonly key = 'logical';
  protected readonly max = DOCS_LOGICAL_MAX;
  protected readonly copyIcon = ICON_COPY;
  protected readonly downIcon = ICON_DOWN;
  protected readonly confirming = signal(false);
  protected readonly lines = computed(() => parseLogicalText(this.text()));
  protected readonly tables = computed(() => this.lines().filter((l) => l.kind === 'table'));
  protected readonly colors = computed(() => tableColors(this.lines()));
  /** Tabelle puntate da qualche chiave esterna: la loro chiave primaria prende il colore. */
  protected readonly referenced = computed(() => {
    const out = new Set<string>();
    for (const l of this.lines()) if (l.kind === 'table') for (const c of l.columns) if (c.fk) out.add(c.fk.toUpperCase());
    return out;
  });

  protected colorOf(table: string): string | null {
    return this.colors().get(table.toUpperCase()) ?? null;
  }

  protected regenerate(confirmed: boolean): void {
    if (this.text().trim() && !confirmed) {
      this.confirming.set(true);
      return;
    }
    this.confirming.set(false);
    try {
      this.replace(logicalToText(toLogical(this.store.diagram())));
    } catch (e) {
      this.toasts.show('error', e instanceof Error ? e.message : 'Non riesco a generare il modello.');
    }
  }

  protected download(): void {
    downloadBlob(new Blob([this.text()], { type: 'text/plain;charset=utf-8' }), `${slugify(this.store.diagram().title)}-modello-logico.txt`);
  }
}

/** Analisi del problema: testo libero per le scelte fatte; si scarica insieme al modello in Markdown. */
@Component({
  selector: 'app-analysis',
  template: `
    <section class="ui-panel-body gap-3" aria-label="Analisi del problema">
      <div class="flex flex-wrap gap-2">
        <button type="button" class="ui-btn ui-btn-sm" (click)="copy('Testo')"><span [innerHTML]="copyIcon"></span>Copia</button>
        <button type="button" class="ui-btn ui-btn-sm" (click)="download()"><span [innerHTML]="downIcon"></span>Scarica .md</button>
        <button type="button" class="ui-btn ui-btn-sm" (click)="addChoice()">+ Scelta</button>
      </div>
      <label class="ui-label" for="analysis-text">Analisi e scelte</label>
      <textarea id="analysis-text" class="ui-input min-h-80 leading-relaxed" rows="18"
        [value]="text()" [maxLength]="max" (input)="onInput($any($event.target).value)" (blur)="flush()"
        placeholder="Descrivi il problema e le scelte fatte: perché Casa è un'entità, come hai trattato la gerarchia, …"></textarea>
      <p class="ui-hint">{{ text().length }} / {{ max }} caratteri · il file scaricato contiene anche il modello logico.</p>
    </section>
  `,
})
export class Analysis extends DocField {
  protected readonly key = 'analysis';
  protected readonly max = DOCS_ANALYSIS_MAX;
  protected readonly copyIcon = ICON_COPY;
  protected readonly downIcon = ICON_DOWN;

  protected addChoice(): void {
    const n = (this.text().match(/^Scelta \d+:/gm) ?? []).length + 1;
    const sep = this.text() && !this.text().endsWith('\n\n') ? (this.text().endsWith('\n') ? '\n' : '\n\n') : '';
    this.replace(`${this.text()}${sep}Scelta ${n}: `);
  }

  protected download(): void {
    const d = this.store.diagram();
    downloadBlob(new Blob([docsToMarkdown(d.title, d.docs)], { type: 'text/markdown;charset=utf-8' }), `${slugify(d.title)}-analisi.md`);
  }
}
