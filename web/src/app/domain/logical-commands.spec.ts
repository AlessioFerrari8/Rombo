import { createDiagram } from './commands';
import { buildNegozio } from './fixtures/logical';
import {
  addColumn, addForeignKey, addTable, checkForeignKey, clearLogical, deleteColumn, deleteForeignKey, deleteTables,
  moveColumn, moveTables, removeUnique, renameTable, replaceLogical, setForeignKeyColumns, setTablePositions,
  toggleUnique, togglePrimaryKey, updateColumn,
} from './logical-commands';
import { parseDiagramFile, serializeDiagram } from './serialize';
import { tableById } from './model';

const valid = (d: Parameters<typeof serializeDiagram>[0]) => parseDiagramFile(serializeDiagram(d)).ok;

describe('comandi dello schema logico', () => {
  it('non modificano il diagramma di partenza', () => {
    const d0 = createDiagram();
    const { diagram } = addTable(d0, { x: 1, y: 2 });
    expect(d0.logical).toBeUndefined();
    expect(diagram.logical!.tables).toHaveLength(1);
  });

  it('danno nomi unici di default a tabelle e colonne', () => {
    let d = addTable(createDiagram(), { x: 0, y: 0 }).diagram;
    const t2 = addTable(d, { x: 0, y: 0 });
    d = t2.diagram;
    expect(d.logical!.tables.map((t) => t.name)).toEqual(['Tabella', 'Tabella_2']);
    d = addColumn(d, t2.id).diagram;
    d = addColumn(d, t2.id).diagram;
    expect(tableById(d, t2.id)!.columns.map((c) => c.name)).toEqual(['colonna', 'colonna_2']);
  });

  it('addColumn su una tabella che non esiste non fa niente', () => {
    const d = createDiagram();
    const r = addColumn(d, 'nope');
    expect(r.id).toBe('');
    expect(r.diagram).toBe(d);
  });

  it('rinomina e sposta le tabelle', () => {
    const { d, cliente, ordine } = buildNegozio();
    let x = renameTable(d, cliente, '  Persona ');
    expect(tableById(x, cliente)!.name).toBe('Persona');
    x = moveTables(x, [cliente, ordine], 16, 32);
    expect(tableById(x, cliente)!.pos).toEqual({ x: 16, y: 32 });
    expect(tableById(x, ordine)!.pos).toEqual({ x: 416, y: 32 });
    x = setTablePositions(x, { [cliente]: { x: 5, y: 6 } });
    expect(tableById(x, cliente)!.pos).toEqual({ x: 5, y: 6 });
    expect(tableById(x, ordine)!.pos).toEqual({ x: 416, y: 32 });
  });

  it('eliminare una tabella toglie le FK che puntano a lei', () => {
    const { d, cliente, ordine } = buildNegozio();
    const x = deleteTables(d, [cliente]);
    expect(x.logical!.tables).toHaveLength(1);
    expect(tableById(x, ordine)!.foreignKeys).toEqual([]);
    expect(valid(x)).toBe(true);
  });

  it('entrare nella PK rende la colonna NOT NULL; uscirne non la cambia', () => {
    const { d, cliente } = buildNegozio();
    const nome = tableById(d, cliente)!.columns[1].id;
    expect(tableById(d, cliente)!.columns[1].nullable).toBe(true);
    const x = togglePrimaryKey(d, cliente, nome);
    expect(tableById(x, cliente)!.primaryKey).toHaveLength(2);
    expect(tableById(x, cliente)!.columns[1].nullable).toBe(false);
    const y = togglePrimaryKey(x, cliente, nome);
    expect(tableById(y, cliente)!.primaryKey).toHaveLength(1);
    expect(tableById(y, cliente)!.columns[1].nullable).toBe(false);
  });

  it('aggiorna nome, tipo e nullabilita di una colonna', () => {
    const { d, ordine, oCliente } = buildNegozio();
    const x = updateColumn(d, ordine, oCliente, { name: 'idCliente', type: 'BIGINT', nullable: false });
    const c = tableById(x, ordine)!.columns[1];
    expect([c.name, c.type, c.nullable]).toEqual(['idCliente', 'BIGINT', false]);
  });

  it('riordina le colonne', () => {
    const { d, cliente, cId } = buildNegozio();
    const x = moveColumn(d, cliente, cId, 1);
    expect(tableById(x, cliente)!.columns.map((c) => c.name)).toEqual(['nome', 'id']);
    expect(moveColumn(x, cliente, cId, 1)).toEqual(x); // gia' ultima: non cambia
  });

  it('UNIQUE a colonna singola si accende e si spegne; quelle composte si tolgono per indice', () => {
    const { d, cliente } = buildNegozio();
    const nome = tableById(d, cliente)!.columns[1].id;
    let x = toggleUnique(d, cliente, nome);
    expect(tableById(x, cliente)!.uniques).toEqual([[nome]]);
    x = toggleUnique(x, cliente, nome);
    expect(tableById(x, cliente)!.uniques).toEqual([]);
    x = toggleUnique(x, cliente, nome);
    x = removeUnique(x, cliente, 0);
    expect(tableById(x, cliente)!.uniques).toEqual([]);
  });

  it('eliminare una colonna pulisce PK, UNIQUE, CHECK e FK (anche quelle che la riferiscono)', () => {
    const { d, cliente, ordine, cId, oCliente } = buildNegozio();
    let x = toggleUnique(d, ordine, oCliente);
    x = { ...x, logical: { tables: x.logical!.tables.map((t) => (t.id === ordine ? { ...t, checks: [{ columnId: oCliente, values: ['a'] }] } : t)) } };
    const noFk = deleteColumn(x, ordine, oCliente); // la colonna della FK
    expect(tableById(noFk, ordine)!.foreignKeys).toEqual([]);
    expect(tableById(noFk, ordine)!.uniques).toEqual([]);
    expect(tableById(noFk, ordine)!.checks).toEqual([]);
    expect(valid(noFk)).toBe(true);
    const noRef = deleteColumn(x, cliente, cId); // la colonna riferita da una FK e la PK di Cliente
    expect(tableById(noRef, cliente)!.primaryKey).toEqual([]);
    expect(tableById(noRef, ordine)!.foreignKeys).toEqual([]);
    expect(valid(noRef)).toBe(true);
  });

  it('addForeignKey usa la PK di destinazione e controlla numero di colonne', () => {
    const { d, cliente, ordine, cId, oId, oCliente } = buildNegozio();
    expect(checkForeignKey(d, ordine, [oCliente], cliente)).toBeNull();
    expect(checkForeignKey(d, ordine, [oCliente, oId], cliente)).toMatch(/1 colonna/);
    expect(checkForeignKey(d, ordine, [oCliente], 'nope')).toMatch(/non trovata/i);
    const senzaPk = togglePrimaryKey(d, cliente, cId); // Cliente resta senza PK
    expect(checkForeignKey(senzaPk, ordine, [oCliente], cliente)).toMatch(/chiave primaria/);
    const bad = addForeignKey(senzaPk, ordine, [oCliente], cliente);
    expect(bad.id).toBe('');
    expect(bad.diagram).toBe(senzaPk);
    const ok = addForeignKey(d, ordine, [oId], cliente);
    expect(ok.id).not.toBe('');
    const fk = tableById(ok.diagram, ordine)!.foreignKeys.at(-1)!;
    expect(fk.refColumnIds).toEqual([cId]);
    expect(valid(ok.diagram)).toBe(true);
  });

  it('cambia le colonne di una FK solo se il numero torna; la elimina', () => {
    const { d, ordine, oId, oCliente, fk } = buildNegozio();
    const x = setForeignKeyColumns(d, ordine, fk, [oId]);
    expect(tableById(x, ordine)!.foreignKeys[0].columnIds).toEqual([oId]);
    expect(setForeignKeyColumns(d, ordine, fk, [oId, oCliente])).toBe(d);
    expect(tableById(deleteForeignKey(d, ordine, fk), ordine)!.foreignKeys).toEqual([]);
  });

  it('replaceLogical e clearLogical', () => {
    const { d } = buildNegozio();
    expect(clearLogical(d).logical).toBeUndefined();
    const x = replaceLogical(createDiagram(), d.logical!);
    expect(x.logical!.tables).toHaveLength(2);
  });
});
