import { Created, edit } from './commands';
import { newId } from './ids';
import { DEFAULT_SQL_TYPE, Diagram, Id, LColumn, LTable, LogicalDiagram, Point, tableById } from './model';

const MAX_NAME = 80;
const MAX_TYPE = 20;

function tablesOf(x: Diagram): LTable[] {
  return (x.logical ??= { tables: [] }).tables;
}

function table(x: Diagram, id: Id): LTable | undefined {
  return x.logical?.tables.find((t) => t.id === id);
}

/** Come uniqueName di commands.ts, ma con "_" (i nomi di tabella e colonna non hanno spazi). */
function uniqueIdent(taken: Iterable<string>, base: string): string {
  const set = new Set([...taken].map((n) => n.trim().toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}

const sameSet = (a: Id[], b: Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function addTable(d: Diagram, pos: Point, name?: string): Created {
  const id = newId();
  const diagram = edit(d, (x) => {
    const tables = tablesOf(x);
    tables.push({
      id, name: uniqueIdent(tables.map((t) => t.name), name?.trim().slice(0, MAX_NAME) || 'Tabella'), pos,
      columns: [], primaryKey: [], uniques: [], foreignKeys: [], checks: [],
    });
  });
  return { diagram, id };
}

export function renameTable(d: Diagram, tableId: Id, name: string): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (t) t.name = name.trim().slice(0, MAX_NAME);
  });
}

export function moveTables(d: Diagram, ids: Iterable<Id>, dx: number, dy: number): Diagram {
  const set = new Set(ids);
  return edit(d, (x) => {
    for (const t of x.logical?.tables ?? []) if (set.has(t.id)) t.pos = { x: t.pos.x + dx, y: t.pos.y + dy };
  });
}

export function setTablePositions(d: Diagram, positions: Record<Id, Point>): Diagram {
  return edit(d, (x) => {
    for (const t of x.logical?.tables ?? []) if (positions[t.id]) t.pos = positions[t.id];
  });
}

export function deleteTables(d: Diagram, ids: Iterable<Id>): Diagram {
  const gone = new Set(ids);
  return edit(d, (x) => {
    if (!x.logical) return;
    x.logical.tables = x.logical.tables.filter((t) => !gone.has(t.id));
    for (const t of x.logical.tables) t.foreignKeys = t.foreignKeys.filter((f) => !gone.has(f.refTableId));
  });
}

export function addColumn(d: Diagram, tableId: Id, name?: string, type: string = DEFAULT_SQL_TYPE): Created {
  if (!tableById(d, tableId)) return { diagram: d, id: '' };
  const id = newId();
  const diagram = edit(d, (x) => {
    const t = table(x, tableId)!;
    const col: LColumn = {
      id, name: uniqueIdent(t.columns.map((c) => c.name), name?.trim().slice(0, MAX_NAME) || 'colonna'), type: type.slice(0, MAX_TYPE), nullable: true,
    };
    t.columns.push(col);
  });
  return { diagram, id };
}

export function updateColumn(
  d: Diagram, tableId: Id, colId: Id, patch: Partial<Pick<LColumn, 'name' | 'type' | 'nullable'>>,
): Diagram {
  return edit(d, (x) => {
    const c = table(x, tableId)?.columns.find((col) => col.id === colId);
    if (!c) return;
    if (patch.name !== undefined) c.name = patch.name.trim().slice(0, MAX_NAME);
    if (patch.type !== undefined) c.type = patch.type.slice(0, MAX_TYPE);
    if (patch.nullable !== undefined) c.nullable = patch.nullable;
  });
}

export function moveColumn(d: Diagram, tableId: Id, colId: Id, delta: -1 | 1): Diagram {
  const t = tableById(d, tableId);
  const i = t?.columns.findIndex((c) => c.id === colId) ?? -1;
  const j = i + delta;
  if (!t || i < 0 || j < 0 || j >= t.columns.length) return d;
  return edit(d, (x) => {
    const cols = table(x, tableId)!.columns;
    [cols[i], cols[j]] = [cols[j], cols[i]];
  });
}

export function deleteColumn(d: Diagram, tableId: Id, colId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (!t) return;
    t.columns = t.columns.filter((c) => c.id !== colId);
    t.primaryKey = t.primaryKey.filter((c) => c !== colId);
    t.uniques = t.uniques.map((u) => u.filter((c) => c !== colId)).filter((u) => u.length);
    t.checks = t.checks.filter((ch) => ch.columnId !== colId);
    t.foreignKeys = t.foreignKeys.filter((f) => !f.columnIds.includes(colId));
    for (const other of x.logical!.tables) {
      other.foreignKeys = other.foreignKeys.filter((f) => !(f.refTableId === tableId && f.refColumnIds.includes(colId)));
    }
  });
}

export function togglePrimaryKey(d: Diagram, tableId: Id, colId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    const col = t?.columns.find((c) => c.id === colId);
    if (!t || !col) return;
    if (t.primaryKey.includes(colId)) t.primaryKey = t.primaryKey.filter((c) => c !== colId);
    else {
      t.primaryKey.push(colId);
      col.nullable = false;
    }
  });
}

export function toggleUnique(d: Diagram, tableId: Id, colId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (!t || !t.columns.some((c) => c.id === colId)) return;
    const i = t.uniques.findIndex((u) => sameSet(u, [colId]));
    if (i >= 0) t.uniques.splice(i, 1);
    else t.uniques.push([colId]);
  });
}

export function removeUnique(d: Diagram, tableId: Id, index: number): Diagram {
  return edit(d, (x) => {
    table(x, tableId)?.uniques.splice(index, 1);
  });
}

/** null se la FK si puo' creare, altrimenti il messaggio da mostrare. */
export function checkForeignKey(d: Diagram, tableId: Id, columnIds: Id[], refTableId: Id): string | null {
  const t = tableById(d, tableId);
  const r = tableById(d, refTableId);
  if (!t || !r) return 'Tabella non trovata.';
  const n = r.primaryKey.length;
  if (!n) return `«${r.name}» non ha una chiave primaria: sceglila prima.`;
  if (columnIds.length !== n) return `La chiave di «${r.name}» ha ${n} ${n === 1 ? 'colonna' : 'colonne'}: ne servono altrettante.`;
  if (new Set(columnIds).size !== n || !columnIds.every((c) => t.columns.some((x) => x.id === c))) return 'Colonne non valide.';
  return null;
}

export function addForeignKey(d: Diagram, tableId: Id, columnIds: Id[], refTableId: Id): Created {
  if (checkForeignKey(d, tableId, columnIds, refTableId)) return { diagram: d, id: '' };
  const id = newId();
  const diagram = edit(d, (x) => {
    const r = table(x, refTableId)!;
    table(x, tableId)!.foreignKeys.push({ id, columnIds: [...columnIds], refTableId, refColumnIds: [...r.primaryKey] });
  });
  return { diagram, id };
}

export function setForeignKeyColumns(d: Diagram, tableId: Id, fkId: Id, columnIds: Id[]): Diagram {
  const t = tableById(d, tableId);
  const fk = t?.foreignKeys.find((f) => f.id === fkId);
  if (!t || !fk || columnIds.length !== fk.refColumnIds.length) return d;
  if (new Set(columnIds).size !== columnIds.length || !columnIds.every((c) => t.columns.some((x) => x.id === c))) return d;
  return edit(d, (x) => {
    table(x, tableId)!.foreignKeys.find((f) => f.id === fkId)!.columnIds = [...columnIds];
  });
}

export function deleteForeignKey(d: Diagram, tableId: Id, fkId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (t) t.foreignKeys = t.foreignKeys.filter((f) => f.id !== fkId);
  });
}

export function replaceLogical(d: Diagram, l: LogicalDiagram): Diagram {
  return edit(d, (x) => {
    x.logical = structuredClone(l);
  });
}

export function clearLogical(d: Diagram): Diagram {
  return edit(d, (x) => {
    delete x.logical;
  });
}
