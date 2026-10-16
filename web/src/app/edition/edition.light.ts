import { IssueCode } from '../domain/validate';
import { Edition } from './edition-types';

export type { Edition } from './edition-types';

/** Codici che riguardano solo la traduzione verso il logico (tipi SQL, strategie delle gerarchie). */
const HIDDEN: IssueCode[] = [
  'invalid-sql-type', 'text-in-key', 'multivalued-attribute', 'isa-default-strategy', 'merge-down-partial', 'isa-mixed-strategies',
];

/** Rombo Light (maturita'): solo il modello ER, niente logico ne' SQL. Sostituisce edition.ts nella build light. */
export const EDITION: Edition = { light: true, name: 'Rombo Light', logical: false, hiddenIssueCodes: HIDDEN };
