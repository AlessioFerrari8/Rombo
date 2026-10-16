import { Component, computed, inject } from '@angular/core';
import { LOGICAL_TABS, LogicalPanel, LogicalProperties, SqlPanel } from '../../edition/logical-ui';
import { EditorStore, PanelTab } from '../editor-store';
import { Problems } from '../problems/problems';
import { Properties } from '../properties/properties';

@Component({ selector: 'app-side-panel', templateUrl: './side-panel.html', imports: [Properties, LogicalProperties, Problems, LogicalPanel, SqlPanel] })
export class SidePanel {
  protected readonly store = inject(EditorStore);
  protected readonly warnings = computed(() => this.store.activeIssues().filter((i) => i.severity === 'warning').length);
  protected readonly tabs: ReadonlyArray<{ id: PanelTab; label: string }> = [
    { id: 'props', label: 'Proprietà' },
    { id: 'problems', label: 'Problemi' },
    // «Schema logico» e «SQL»: solo nell'edizione completa
    ...LOGICAL_TABS,
  ];
}
