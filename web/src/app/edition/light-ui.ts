/**
 * Schede di testo di Rombo Light (modello logico scritto e analisi del problema). Nell'edizione completa sono
 * vuote: in Light (ng build -c light) questo file e' sostituito da light-ui.light.ts.
 */
import { Component } from '@angular/core';
import type { PanelTab } from '../editor/editor-store';

@Component({ selector: 'app-model-text', template: '' })
export class ModelText {}

@Component({ selector: 'app-analysis', template: '' })
export class Analysis {}

export const LIGHT_TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [];
