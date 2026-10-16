/**
 * Rombo Light: gli stessi selettori di logical-ui.ts, ma vuoti. Cosi' i template restano uguali e nel
 * bundle non entrano ne' il modo Logico ne' l'SQL (e nemmeno i tipi delle colonne).
 */
import { Component, input, output } from '@angular/core';
import type { PanelTab, Tool } from '../editor/editor-store';

export interface PaletteItem { tool: Tool; label: string; key: string; hint: string }

@Component({ selector: 'app-logical-canvas', template: '' })
export class LogicalCanvas {}

@Component({ selector: 'app-logical-properties', template: '' })
export class LogicalProperties {}

@Component({ selector: 'app-logical-panel', template: '' })
export class LogicalPanel {}

@Component({ selector: 'app-sql-panel', template: '' })
export class SqlPanel {}

@Component({ selector: 'app-regenerate-dialog', template: '' })
export class RegenerateDialog {}

@Component({ selector: 'app-type-picker', template: '' })
export class TypePicker {
  readonly value = input<string | undefined>(undefined);
  readonly disabled = input(false);
  readonly changed = output<string>();
}

@Component({ selector: 'app-mode-switch', template: '' })
export class ModeSwitch {}

@Component({ selector: 'app-logical-export-items', template: '' })
export class LogicalExportItems {}

@Component({ selector: 'app-logical-ready', template: '' })
export class LogicalReady {}

export const LOGICAL_TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [];
export const LOGICAL_PALETTE: readonly PaletteItem[] = [];
