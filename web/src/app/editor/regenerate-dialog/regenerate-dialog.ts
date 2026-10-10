import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-regenerate-dialog', templateUrl: './regenerate-dialog.html' })
export class RegenerateDialog {
  protected readonly store = inject(EditorStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.store.confirmRegenerate() && !el.open) el.showModal();
      if (!this.store.confirmRegenerate() && el.open) el.close();
    });
  }

  cancel(): void {
    this.store.confirmRegenerate.set(false);
  }

  replace(): void {
    this.store.confirmRegenerate.set(false);
    void this.store.generateLogical();
  }
}
