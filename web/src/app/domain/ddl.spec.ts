import { LogicalSchema, Table } from './logical';
import { toDDL, topoSort } from './ddl';

const t = (name: string, extra: Partial<Table> = {}): Table => ({
  name, sourceId: name, columns: [{ name: 'Id', type: 'INT', nullable: false }], primaryKey: ['Id'],
  uniques: [], foreignKeys: [], checks: [], ...extra,
});

describe('topoSort', () => {
  it('mette prima le tabelle riferite, mantenendo l\'ordine dove puo', () => {
    const a = t('A', { foreignKeys: [{ columns: ['Id'], refTable: 'B', refColumns: ['Id'] }] });
    const b = t('B');
    const c = t('C');
    expect(topoSort([a, b, c]).ordered.map((x) => x.name)).toEqual(['B', 'A', 'C']);
  });
  it('riconosce i cicli e ignora gli autoriferimenti', () => {
    const a = t('A', { foreignKeys: [{ columns: ['Id'], refTable: 'B', refColumns: ['Id'] }] });
    const b = t('B', { foreignKeys: [{ columns: ['Id'], refTable: 'A', refColumns: ['Id'] }] });
    expect(topoSort([a, b]).cyclic).toBe(true);
    const self = t('S', { foreignKeys: [{ columns: ['Id'], refTable: 'S', refColumns: ['Id'] }] });
    expect(topoSort([self]).cyclic).toBe(false);
  });
});

describe('toDDL', () => {
  const schema: LogicalSchema = {
    notes: [],
    tables: [
      t('Auto', {
        columns: [
          { name: 'Targa', type: 'VARCHAR(10)', nullable: false },
          { name: 'CF_Proprietario', type: 'CHAR(16)', nullable: true },
          { name: 'Tipo', type: 'VARCHAR(50)', nullable: false },
        ],
        primaryKey: ['Targa'],
        uniques: [['CF_Proprietario']],
        foreignKeys: [{ columns: ['CF_Proprietario'], refTable: 'Proprietario', refColumns: ['CF'] }],
        checks: [{ column: 'Tipo', values: ['Utilitaria', "d'epoca"] }],
      }),
      t('Proprietario', { columns: [{ name: 'CF', type: 'CHAR(16)', nullable: false }], primaryKey: ['CF'] }),
    ],
  };

  it('Postgres: virgolette doppie, vincoli con nome, ordine delle FK', () => {
    const sql = toDDL(schema, 'postgres');
    expect(sql.indexOf('CREATE TABLE "Proprietario"')).toBeLessThan(sql.indexOf('CREATE TABLE "Auto"'));
    expect(sql).toContain('  "Targa" VARCHAR(10) NOT NULL,\n  "CF_Proprietario" CHAR(16),');
    expect(sql).toContain('CONSTRAINT "pk_Auto" PRIMARY KEY ("Targa")');
    expect(sql).toContain('CONSTRAINT "uq_Auto_1" UNIQUE ("CF_Proprietario")');
    expect(sql).toContain(`CONSTRAINT "ck_Auto_Tipo" CHECK ("Tipo" IN ('Utilitaria', 'd''epoca'))`);
    expect(sql).toContain('CONSTRAINT "fk_Auto_1" FOREIGN KEY ("CF_Proprietario") REFERENCES "Proprietario" ("CF")');
    expect(sql.startsWith('-- Generato da Rombo (postgres)\n')).toBe(true);
    expect(sql).not.toContain('ENGINE');
  });

  it('MySQL: backtick e InnoDB', () => {
    const sql = toDDL(schema, 'mysql');
    expect(sql).toContain('CREATE TABLE `Auto` (');
    expect(sql).toContain(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;');
  });

  it('con un ciclo di FK crea le tabelle e poi aggiunge le FK con ALTER TABLE', () => {
    const a = t('A', { foreignKeys: [{ columns: ['Id'], refTable: 'B', refColumns: ['Id'] }] });
    const b = t('B', { foreignKeys: [{ columns: ['Id'], refTable: 'A', refColumns: ['Id'] }] });
    const sql = toDDL({ tables: [a, b], notes: [] }, 'postgres');
    expect(sql).not.toMatch(/CREATE TABLE[^;]*FOREIGN KEY/);
    expect(sql).toContain('ALTER TABLE "A" ADD CONSTRAINT "fk_A_1" FOREIGN KEY ("Id") REFERENCES "B" ("Id");');
  });
});
