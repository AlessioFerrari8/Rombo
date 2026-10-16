import { Edition } from './edition-types';

export type { Edition } from './edition-types';

/** Rombo completo. Nella build light questo file e' sostituito da edition.light.ts (angular.json, fileReplacements). */
export const EDITION: Edition = { light: false, name: 'Rombo', logical: true, hiddenIssueCodes: [] };
