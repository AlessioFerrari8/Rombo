/**
 * Confine del modello logico e dell'SQL lato interfaccia: componenti, schede e voci della palette.
 * In Light (ng build -c light) e' sostituito da logical-ui.light.ts: gli stessi selettori, vuoti.
 */
import type { PanelTab, Tool } from '../editor/editor-store';

export { LogicalCanvas } from '../editor/logical-canvas/logical-canvas';
export { LogicalProperties } from '../editor/logical-properties/logical-properties';
export { LogicalPanel } from '../editor/logical-panel/logical-panel';
export { SqlPanel } from '../editor/sql-panel/sql-panel';
export { RegenerateDialog } from '../editor/regenerate-dialog/regenerate-dialog';
export { TypePicker } from '../editor/type-picker/type-picker';
export { LogicalExportItems, LogicalReady, ModeSwitch } from '../editor/logical-extras/logical-extras';

export interface PaletteItem { tool: Tool; label: string; key: string; hint: string }

/** Schede del pannello laterale che esistono solo nell'edizione completa. */
export const LOGICAL_TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: 'logical', label: 'Schema logico' },
  { id: 'sql', label: 'SQL' },
];

export const LOGICAL_PALETTE: readonly PaletteItem[] = [
  { tool: 'select', label: 'Seleziona', key: 'V', hint: 'Seleziona e sposta le tabelle; trascina il pallino di una colonna su un\'altra tabella per creare una chiave esterna.' },
  { tool: 'table', label: 'Tabella', key: 'T', hint: 'Clicca sul foglio per creare una tabella.' },
];
