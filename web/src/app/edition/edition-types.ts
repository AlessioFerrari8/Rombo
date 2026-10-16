import { IssueCode } from '../domain/validate';

/** Edizione scelta a build-time: in Light (ng build -c light) edition.ts e' sostituito da edition.light.ts. */
export interface Edition {
  light: boolean;
  /** Nome mostrato nei titoli. */
  name: string;
  /** Modo Logico, schema logico, SQL e tipi delle colonne. */
  logical: boolean;
  /** Avvisi/errori che riguardano solo la traduzione verso il logico: in Light non si mostrano. */
  hiddenIssueCodes: readonly IssueCode[];
}
