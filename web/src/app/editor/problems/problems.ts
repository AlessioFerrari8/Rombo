import { Component, computed, inject } from '@angular/core';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-problems', templateUrl: './problems.html' })
export class Problems {
  protected readonly store = inject(EditorStore);
  protected readonly warnings = computed(() => this.store.issues().filter((i) => i.severity === 'warning').length);
}
