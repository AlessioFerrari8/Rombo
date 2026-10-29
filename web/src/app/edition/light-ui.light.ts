/** Rombo Light: le schede «Modello logico» (testo) e «Analisi» del pannello laterale. */
import type { PanelTab } from '../editor/editor-store';

export { Analysis, ModelText } from '../editor/light-text/light-text';

export const LIGHT_TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: 'model', label: 'Modello logico' },
  { id: 'analysis', label: 'Analisi' },
];
