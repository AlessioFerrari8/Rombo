import { Component, effect, inject, input } from '@angular/core';
import { Diagram } from '../../domain/model';
import { Canvas } from '../../editor/canvas/canvas';
import { EditorStore } from '../../editor/editor-store';

@Component({
  selector: 'app-diagram-preview',
  templateUrl: './diagram-preview.html',
  imports: [Canvas],
  providers: [EditorStore],
})
export class DiagramPreview {
  readonly diagram = input.required<Diagram>();
  private readonly store = inject(EditorStore);

  constructor() {
    effect(() => this.store.load(this.diagram(), { readonly: true }));
  }
}
