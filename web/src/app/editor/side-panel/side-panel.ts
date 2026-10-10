import { Component, computed, inject } from '@angular/core';
import { EditorStore, PanelTab } from '../editor-store';
import { LogicalPanel } from '../logical-panel/logical-panel';
import { Problems } from '../problems/problems';
import { Properties } from '../properties/properties';
import { SqlPanel } from '../sql-panel/sql-panel';

@Component({ selector: 'app-side-panel', templateUrl: './side-panel.html', imports: [Properties, Problems, LogicalPanel, SqlPanel] })
export class SidePanel {
  protected readonly store = inject(EditorStore);
  protected readonly warnings = computed(() => this.store.issues().filter((i) => i.severity === 'warning').length);
  protected readonly tabs: Array<{ id: PanelTab; label: string }> = [
    { id: 'props', label: 'Proprietà' },
    { id: 'problems', label: 'Problemi' },
    { id: 'logical', label: 'Schema logico' },
    { id: 'sql', label: 'SQL' },
  ];
}
