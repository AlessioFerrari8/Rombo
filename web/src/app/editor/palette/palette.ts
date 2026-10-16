import { Component, computed, inject } from '@angular/core';
import { LOGICAL_PALETTE, PaletteItem } from '../../edition/logical-ui';
import { EditorStore, Tool } from '../editor-store';

const ER_ITEMS: PaletteItem[] = [
  { tool: 'select', label: 'Seleziona', key: 'V', hint: 'Seleziona e sposta. Shift + trascina per selezionare un\'area.' },
  { tool: 'entity', label: 'Entità', key: 'E', hint: 'Clicca sul foglio per creare un\'entità.' },
  { tool: 'relationship', label: 'Associazione', key: 'R', hint: 'Trascina da un\'entità a un\'altra.' },
  { tool: 'attribute', label: 'Attributo', key: 'A', hint: 'Clicca un\'entità o un\'associazione.' },
  { tool: 'isa', label: 'Generalizzazione', key: 'G', hint: 'Clicca il padre, poi i figli, poi Invio.' },
];
@Component({ selector: 'app-palette', templateUrl: './palette.html' })
export class Palette {
  protected readonly store = inject(EditorStore);
  protected readonly items = computed(() => (this.store.mode() === 'logical' ? LOGICAL_PALETTE : ER_ITEMS));

  choose(tool: Tool): void {
    if (tool === 'isa') this.store.startIsa();
    else if (tool === 'relationship') this.store.relationshipShortcut();
    else if (tool === 'attribute') this.store.attributeShortcut();
    else {
      this.store.cancelTool();
      this.store.tool.set(tool);
    }
  }

  layout(): void {
    if (this.store.mode() === 'logical') void this.store.layoutLogical();
    else void this.store.autoLayout();
  }
}
