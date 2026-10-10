import { buildNegozio } from './fixtures/logical';
import { addColumn, addTable, deleteColumn, renameTable, togglePrimaryKey, updateColumn } from './logical-commands';
import { validateLogical } from './validate-logical';

const codes = (l: Parameters<typeof validateLogical>[0]) => validateLogical(l).map((i) => i.code);

describe('validateLogical', () => {
  it('senza schema o con lo schema del negozio: nessun problema', () => {
    expect(validateLogical(undefined)).toEqual([]);
    expect(validateLogical(buildNegozio().d.logical)).toEqual([]);
  });

  it('nome tabella vuoto, duplicato (senza badare alle maiuscole) e troppo lungo', () => {
    const { d, cliente, ordine } = buildNegozio();
    expect(codes(renameTable(d, cliente, '  ').logical)).toContain('empty-table-name');
    const dup = validateLogical(renameTable(d, ordine, 'CLIENTE').logical).find((i) => i.code === 'duplicate-name')!;
    expect(dup.severity).toBe('error');
    expect(dup.targetIds.sort()).toEqual([cliente, ordine].sort());
    expect(codes(renameTable(d, cliente, 'x'.repeat(61)).logical)).toContain('name-too-long');
  });

  it('nome che non e un identificatore SQL semplice: solo avviso', () => {
    const { d, cliente } = buildNegozio();
    const i = validateLogical(renameTable(d, cliente, 'Città vecchia').logical).find((x) => x.code === 'invalid-identifier')!;
    expect(i.severity).toBe('warning');
  });

  it('colonne: nome vuoto, duplicato nella stessa tabella, tipo non valido', () => {
    const { d, cliente, ordine, oCliente } = buildNegozio();
    const nome = d.logical!.tables[0].columns[1].id;
    expect(codes(updateColumn(d, cliente, nome, { name: '' }).logical)).toContain('empty-column-name');
    expect(codes(updateColumn(d, ordine, oCliente, { name: 'ID' }).logical)).toContain('duplicate-column');
    expect(codes(updateColumn(d, cliente, nome, { type: 'VARCHAR' }).logical)).toContain('invalid-sql-type');
  });

  it('avvisi: tabella vuota, senza PK, PK nullable', () => {
    const { d, cliente, cId } = buildNegozio();
    const vuota = addTable(d, { x: 0, y: 300 }, 'Vuota').diagram;
    expect(validateLogical(vuota.logical).find((i) => i.code === 'empty-table')!.severity).toBe('warning');
    const senzaPk = togglePrimaryKey(d, cliente, cId);
    expect(codes(senzaPk.logical)).toContain('no-table-key');
    const nullable = updateColumn(d, cliente, cId, { nullable: true });
    expect(codes(nullable.logical)).toContain('nullable-key');
  });

  it('FK che non punta alla PK o a un UNIQUE della destinazione e un errore', () => {
    const { d, cliente } = buildNegozio();
    const nome = d.logical!.tables[0].columns[1].id;
    const cambiata = togglePrimaryKey(togglePrimaryKey(d, cliente, d.logical!.tables[0].columns[0].id), cliente, nome);
    const i = validateLogical(cambiata.logical).find((x) => x.code === 'fk-target-not-key')!;
    expect(i.severity).toBe('error');
    expect(i.message).toContain('Ordine');
  });

  it('FK con tipi diversi dalla colonna riferita: avviso', () => {
    const { d, ordine, oCliente } = buildNegozio();
    const i = validateLogical(updateColumn(d, ordine, oCliente, { type: 'TEXT' }).logical).find((x) => x.code === 'fk-type-mismatch')!;
    expect(i.severity).toBe('warning');
  });

  it('una colonna eliminata non lascia problemi di riferimento', () => {
    const { d, ordine, oCliente } = buildNegozio();
    expect(validateLogical(deleteColumn(d, ordine, oCliente).logical)).toEqual([]);
    expect(addColumn(d, ordine).id).not.toBe('');
  });
});
