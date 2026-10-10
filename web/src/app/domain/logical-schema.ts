import { newId } from './ids';
import { LogicalSchema, Table, toLogical } from './logical';
import { tableRect } from './logical-geometry';
import { Diagram, Id, LTable, LogicalDiagram } from './model';

/** Dal modello a id (modificabile) allo schema per nomi che capiscono formatLogical e toDDL. */
export function toTables(l: LogicalDiagram): LogicalSchema {
  const byId = new Map(l.tables.map((t) => [t.id, t]));
  const names = (t: LTable, ids: Id[]) =>
    ids.map((id) => t.columns.find((c) => c.id === id)?.name).filter((n): n is string => n !== undefined);
  const tables: Table[] = l.tables.map((t) => ({
    name: t.name,
    sourceId: t.id,
    columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
    primaryKey: names(t, t.primaryKey),
    uniques: t.uniques.map((u) => names(t, u)).filter((u) => u.length),
    foreignKeys: t.foreignKeys.flatMap((f) => {
      const r = byId.get(f.refTableId);
      return r ? [{ columns: names(t, f.columnIds), refTable: r.name, refColumns: names(r, f.refColumnIds) }] : [];
    }),
    checks: t.checks.flatMap((ch) => {
      const column = names(t, [ch.columnId])[0];
      return column === undefined ? [] : [{ column, values: ch.values }];
    }),
  }));
  return { tables, notes: [] };
}

const PER_ROW = 3;
const SPACING = 64;

/** Copia modificabile dello schema derivato dall'ER (da usare solo con un ER senza errori). */
export function generateLogical(d: Diagram): LogicalDiagram {
  const schema = toLogical(d);
  const tableIds = new Map(schema.tables.map((t) => [t.name, newId()]));
  const tables: LTable[] = schema.tables.map((t) => {
    const cols = t.columns.map((c) => ({ id: newId(), name: c.name, type: c.type, nullable: c.nullable }));
    const ids = (names: string[]) => names.map((n) => cols.find((c) => c.name === n)!.id);
    return {
      id: tableIds.get(t.name)!,
      name: t.name,
      pos: { x: 0, y: 0 },
      columns: cols,
      primaryKey: ids(t.primaryKey),
      uniques: t.uniques.map(ids),
      foreignKeys: [],
      checks: t.checks.map((ch) => ({ columnId: ids([ch.column])[0], values: [...ch.values] })),
    };
  });
  schema.tables.forEach((t, i) => {
    tables[i].foreignKeys = t.foreignKeys.map((f) => {
      const ref = tables.find((x) => x.id === tableIds.get(f.refTable))!;
      return {
        id: newId(),
        columnIds: f.columns.map((n) => tables[i].columns.find((c) => c.name === n)!.id),
        refTableId: ref.id,
        refColumnIds: f.refColumns.map((n) => ref.columns.find((c) => c.name === n)!.id),
      };
    });
  });
  // griglia provvisoria (il layout ELK la sostituisce subito dopo): righe alte quanto la tabella piu' alta
  let y = 32;
  for (let i = 0; i < tables.length; i += PER_ROW) {
    const row = tables.slice(i, i + PER_ROW);
    let x = 32;
    for (const t of row) {
      t.pos = { x, y };
      x += tableRect(t).w + SPACING;
    }
    y += Math.max(...row.map((t) => tableRect(t).h)) + SPACING;
  }
  return { tables };
}
