import { ForeignKey, LogicalSchema, Table } from './logical';

export type Dialect = 'postgres' | 'mysql';

const MAX_IDENT: Record<Dialect, number> = { postgres: 63, mysql: 64 };

export function topoSort(tables: Table[]): { ordered: Table[]; cyclic: boolean } {
  const names = new Set(tables.map((t) => t.name));
  const deps = new Map(
    tables.map((t) => [t, new Set(t.foreignKeys.map((f) => f.refTable).filter((r) => r !== t.name && names.has(r)))]),
  );
  const ordered: Table[] = [];
  const done = new Set<string>();
  while (ordered.length < tables.length) {
    const next = tables.find((t) => !done.has(t.name) && [...deps.get(t)!].every((dep) => done.has(dep)));
    if (!next) return { ordered: tables, cyclic: true };
    ordered.push(next);
    done.add(next.name);
  }
  return { ordered, cyclic: false };
}

export function toDDL(schema: LogicalSchema, dialect: Dialect): string {
  const q = (n: string) => (dialect === 'postgres' ? `"${n.replace(/"/g, '""')}"` : `\`${n.replace(/`/g, '``')}\``);
  const cname = (n: string) => q(n.slice(0, MAX_IDENT[dialect]));
  const list = (cols: string[]) => cols.map(q).join(', ');
  const fkSql = (t: Table, fk: ForeignKey, i: number) =>
    `CONSTRAINT ${cname(`fk_${t.name}_${i + 1}`)} FOREIGN KEY (${list(fk.columns)}) REFERENCES ${q(fk.refTable)} (${list(fk.refColumns)})`;

  const { ordered, cyclic } = topoSort(schema.tables);
  const out: string[] = [`-- Generato da Rombo (${dialect})`, ''];
  for (const t of ordered) {
    const body = t.columns.map((c) => `  ${q(c.name)} ${c.type}${c.nullable ? '' : ' NOT NULL'}`);
    if (t.primaryKey.length) body.push(`  CONSTRAINT ${cname(`pk_${t.name}`)} PRIMARY KEY (${list(t.primaryKey)})`);
    t.uniques.forEach((u, i) => body.push(`  CONSTRAINT ${cname(`uq_${t.name}_${i + 1}`)} UNIQUE (${list(u)})`));
    for (const ch of t.checks) {
      const values = ch.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
      body.push(`  CONSTRAINT ${cname(`ck_${t.name}_${ch.column}`)} CHECK (${q(ch.column)} IN (${values}))`);
    }
    if (!cyclic) t.foreignKeys.forEach((fk, i) => body.push(`  ${fkSql(t, fk, i)}`));
    out.push(`CREATE TABLE ${q(t.name)} (`, body.join(',\n'), dialect === 'mysql' ? ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;' : ');', '');
  }
  if (cyclic) {
    for (const t of ordered) t.foreignKeys.forEach((fk, i) => out.push(`ALTER TABLE ${q(t.name)} ADD ${fkSql(t, fk, i)};`));
  }
  return out.join('\n').trimEnd() + '\n';
}
