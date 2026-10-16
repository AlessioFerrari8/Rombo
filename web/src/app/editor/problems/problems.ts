import { Component, computed, inject } from '@angular/core';
import { EDITION_CONFIG } from '../../edition/edition-token';
import { LogicalReady } from '../../edition/logical-ui';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-problems', templateUrl: './problems.html', imports: [LogicalReady] })
export class Problems {
  protected readonly store = inject(EditorStore);
  protected readonly edition = inject(EDITION_CONFIG);
  protected readonly warnings = computed(() => this.store.activeIssues().filter((i) => i.severity === 'warning').length);
}
