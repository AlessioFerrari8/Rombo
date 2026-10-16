import { EDITION_CONFIG } from '../../edition/edition-token';
import { AccountMenu } from '../../shared/account-menu/account-menu';
import { isDesktop } from '../../core/platform';
import { DatePipe } from '@angular/common';
import { Component, ElementRef, PendingTasks, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { LocalDiagrams, LocalRecord } from '../../core/local-diagrams';
import { Sync } from '../../core/sync';
import { ThemeService } from '../../core/theme';
import { Toasts } from '../../core/toasts';
import { DIAGRAM_FILE_ACCEPT, DiagramFiles, MAX_DIAGRAM_FILE } from '../../core/diagram-files';
import { newId } from '../../domain/ids';
import { DiagramPreview } from '../diagram-preview/diagram-preview';

@Component({ selector: 'app-home', templateUrl: './home.html', imports: [RouterLink, DatePipe, DiagramPreview, AccountMenu] })
export class Home {
  protected readonly editionName = inject(EDITION_CONFIG).name;
  protected readonly desktop = isDesktop;
  protected readonly accept = DIAGRAM_FILE_ACCEPT;
  private readonly files = inject(DiagramFiles);
  private readonly local = inject(LocalDiagrams);
  protected readonly auth = inject(Auth);
  protected readonly sync = inject(Sync);
  private readonly toasts = inject(Toasts);
  private readonly pendingTasks = inject(PendingTasks);
  protected readonly theme = inject(ThemeService);
  protected readonly records = signal<LocalRecord[] | null>(null);
  protected readonly pendingDelete = signal<LocalRecord | null>(null);
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  constructor() {
    effect(() => {
      this.local.revision();
      // registra il caricamento come pending task: whenStable() nei test (e SSR)
      // lo aspetta davvero, dato che IndexedDB non e' tracciato da Angular
      untracked(() => this.pendingTasks.run(() => this.reload()));
    });
  }

  private async reload(): Promise<void> {
    try {
      this.records.set(await this.local.list());
    } catch {
      this.records.set([]);
      this.toasts.show('error', 'Questo browser non permette di salvare i diagrammi (navigazione privata?).', 10000);
    }
  }

  create(): Promise<void> {
    return this.files.create();
  }

  async openFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_DIAGRAM_FILE) {
      this.toasts.show('error', 'Il file è troppo grande (massimo 2 MB).');
      return;
    }
    await this.files.importText(await file.text());
  }

  async duplicate(r: LocalRecord): Promise<void> {
    const copy = { ...structuredClone(r.diagram), id: newId(), title: `${r.diagram.title} (copia)`.slice(0, 120) };
    await this.local.saveDraft(copy, { uploadable: !!this.auth.user() });
    this.toasts.show('success', `Creato «${copy.title}».`);
  }

  askDelete(r: LocalRecord): void {
    this.pendingDelete.set(r);
    this.confirmDialog().nativeElement.showModal();
  }

  async confirmDelete(): Promise<void> {
    const r = this.pendingDelete();
    this.confirmDialog().nativeElement.close();
    if (!r) return;
    await this.sync.deleteEverywhere(r);
    this.pendingDelete.set(null);
    this.toasts.show('info', `«${r.diagram.title}» eliminato.`);
  }
}
