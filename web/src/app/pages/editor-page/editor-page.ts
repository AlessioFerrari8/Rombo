import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { LocalDiagrams } from '../../core/local-diagrams';
import { Toasts } from '../../core/toasts';
import { ViewportSize } from '../../core/viewport-size';
import { Canvas } from '../../editor/canvas/canvas';
import { ConflictDialog } from '../../editor/conflict-dialog/conflict-dialog';
import { EditorStore } from '../../editor/editor-store';
import { Palette } from '../../editor/palette/palette';
import { SidePanel } from '../../editor/side-panel/side-panel';
import { TopBar } from '../../editor/top-bar/top-bar';

@Component({
  selector: 'app-editor-page',
  templateUrl: './editor-page.html',
  imports: [Canvas, ConflictDialog, Palette, SidePanel, TopBar],
  providers: [EditorStore],
  host: { '(window:pagehide)': 'store.flush()' },
})
export class EditorPage {
  readonly id = input.required<string>();
  protected readonly store = inject(EditorStore);
  private readonly local = inject(LocalDiagrams);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly size = inject(ViewportSize);
  protected readonly ready = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.open(id));
    });
    effect(() => {
      if (this.ready()) this.store.readonly.set(!this.size.wide());
    });
    inject(DestroyRef).onDestroy(() => void this.store.flush());
  }

  private async open(id: string): Promise<void> {
    const rec = await this.local.get(id);
    if (!rec) {
      this.toasts.show('error', 'Diagramma non trovato su questo dispositivo.');
      await this.router.navigateByUrl('/');
      return;
    }
    this.store.load(rec.diagram);
    this.ready.set(true);
  }
}
