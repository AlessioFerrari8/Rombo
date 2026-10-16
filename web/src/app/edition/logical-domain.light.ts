/**
 * Rombo Light: nessun modello logico. Stesse firme di logical-domain.ts (solo tipi importati, che spariscono
 * in compilazione), ma nessuna implementazione: lo store non le chiama, perche' il modo Logico non esiste.
 */
import type * as Commands from '../domain/logical-commands';
import type * as Geometry from '../domain/logical-geometry';
import type * as Logical from '../domain/logical';
import type * as Schema from '../domain/logical-schema';
import type * as Validate from '../domain/validate-logical';
import type * as Layout from '../editor/logical-layout';

export type { LogicalSchema } from '../domain/logical';

const unavailable = (): never => {
  throw new Error('Non disponibile in Rombo Light');
};

export const toLogical: typeof Logical.toLogical = () => ({ tables: [], notes: [] });
export const addForeignKey: typeof Commands.addForeignKey = unavailable;
export const checkForeignKey: typeof Commands.checkForeignKey = () => 'Non disponibile in Rombo Light';
export const deleteForeignKey: typeof Commands.deleteForeignKey = (d) => d;
export const deleteTables: typeof Commands.deleteTables = (d) => d;
export const moveTables: typeof Commands.moveTables = (d) => d;
export const replaceLogical: typeof Commands.replaceLogical = (d) => d;
export const setTablePositions: typeof Commands.setTablePositions = (d) => d;
export const generateLogical: typeof Schema.generateLogical = unavailable;
export const toTables: typeof Schema.toTables = () => ({ tables: [], notes: [] });
export const validateLogical: typeof Validate.validateLogical = () => [];
export const computeLogicalLayout: typeof Layout.computeLogicalLayout = async () => ({});
export const logicalBounds: typeof Geometry.logicalBounds = () => null;
