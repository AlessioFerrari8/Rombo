/**
 * Confine del modello logico e dell'SQL lato dati: tutto cio' che lo store usa passa da qui.
 * In Light (ng build -c light) e' sostituito da logical-domain.light.ts, cosi' nel bundle non resta niente.
 */
export { toLogical } from '../domain/logical';
export type { LogicalSchema } from '../domain/logical';
export {
  addForeignKey, checkForeignKey, deleteForeignKey, deleteTables, moveTables, replaceLogical, setTablePositions,
} from '../domain/logical-commands';
export { generateLogical, toTables } from '../domain/logical-schema';
export { validateLogical } from '../domain/validate-logical';
export { computeLogicalLayout } from '../editor/logical-layout';
export { logicalBounds } from '../domain/logical-geometry';
