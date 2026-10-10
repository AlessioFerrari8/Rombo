import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { Sync } from '../../core/sync';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-conflict-dialog', templateUrl: './conflict-dialog.html' })
export class ConflictDialog {
  private readonly sync = inject(Sync);
  private readonly store = inject(EditorStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly server = computed(() => this.sync.conflicts().get(this.store.diagram().id) ?? null);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.server() && !el.open) el.showModal();
      if (!this.server() && el.open) el.close();
    });
  }

  async keepMine(): Promise<void> {
    await this.store.flush();
    await this.sync.resolveKeepMine(this.store.diagram().id);
  }

  async useServer(): Promise<void> {
    const d = await this.sync.resolveUseServer(this.store.diagram().id);
    if (d) this.store.load(d, { readonly: this.store.readonly() });
  }
}
