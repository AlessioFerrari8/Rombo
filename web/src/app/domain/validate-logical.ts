import { ident } from './logical';
import { Id, LTable, LogicalDiagram, SQL_TYPE_RE } from './model';
import { Issue, IssueCode } from './validate';

const q = (s: string) => `«${s.trim() || 'senza nome'}»`;
const same = (a: Id[], b: Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function validateLogical(l: LogicalDiagram | undefined): Issue[] {
  const out: Issue[] = [];
  if (!l) return out;
  const err = (code: IssueCode, message: string, ...targetIds: Id[]) => out.push({ severity: 'error', code, message, targetIds });
  const warn = (code: IssueCode, message: string, ...targetIds: Id[]) => out.push({ severity: 'warning', code, message, targetIds });
  const byId = new Map(l.tables.map((t) => [t.id, t]));

  const byName = new Map<string, LTable[]>();
  for (const t of l.tables) {
    const name = t.name.trim();
    if (!name) err('empty-table-name', 'Una tabella non ha un nome.', t.id);
    else {
      const key = name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), t]);
      if (name.length > 60) err('name-too-long', `Il nome ${q(name.slice(0, 20) + '…')} è troppo lungo per un database: al massimo 60 caratteri.`, t.id);
      else if (ident(name) !== name) {
        warn('invalid-identifier', `Il nome ${q(name)} non è un identificatore SQL semplice (lettere, cifre e _): nell'SQL verrà messo tra virgolette.`, t.id);
      }
    }
    if (!t.columns.length) warn('empty-table', `La tabella ${q(t.name)} non ha colonne.`, t.id);
    else if (!t.primaryKey.length) warn('no-table-key', `La tabella ${q(t.name)} non ha una chiave primaria.`, t.id);
    const nullableKey = t.columns.filter((c) => t.primaryKey.includes(c.id) && c.nullable);
    if (nullableKey.length) {
      warn('nullable-key', `Nella tabella ${q(t.name)} la chiave primaria ha colonne che possono essere NULL: ${nullableKey.map((c) => q(c.name)).join(', ')}.`, t.id);
    }

    const colNames = new Map<string, number>();
    for (const c of t.columns) {
      const name = c.name.trim();
      if (!name) {
        err('empty-column-name', `Una colonna di ${q(t.name)} non ha un nome.`, t.id);
        continue;
      }
      colNames.set(name.toLowerCase(), (colNames.get(name.toLowerCase()) ?? 0) + 1);
      if (name.length > 60) err('name-too-long', `Il nome ${q(name.slice(0, 20) + '…')} è troppo lungo per un database: al massimo 60 caratteri.`, t.id);
      else if (ident(name) !== name) {
        warn('invalid-identifier', `Il nome ${q(name)} (colonna di ${q(t.name)}) non è un identificatore SQL semplice: nell'SQL verrà messo tra virgolette.`, t.id);
      }
      if (!SQL_TYPE_RE.test(c.type)) err('invalid-sql-type', `Il tipo «${c.type}» della colonna ${q(name)} in ${q(t.name)} non è valido.`, t.id);
    }
    for (const [n, count] of colNames) {
      if (count > 1) err('duplicate-column', `Nella tabella ${q(t.name)} ci sono più colonne chiamate ${q(n)}.`, t.id);
    }

    for (const f of t.foreignKeys) {
      const r = byId.get(f.refTableId);
      if (!r) continue;
      if (!same(f.refColumnIds, r.primaryKey) && !r.uniques.some((u) => same(f.refColumnIds, u))) {
        err('fk-target-not-key', `La chiave esterna di ${q(t.name)} verso ${q(r.name)} non punta alla chiave primaria di ${q(r.name)}.`, t.id);
        continue;
      }
      const mismatch = f.columnIds.some((id, i) => {
        const a = t.columns.find((c) => c.id === id);
        const b = r.columns.find((c) => c.id === f.refColumnIds[i]);
        return a && b && a.type !== b.type;
      });
      if (mismatch) warn('fk-type-mismatch', `La chiave esterna di ${q(t.name)} verso ${q(r.name)} ha colonne di tipo diverso da quelle riferite.`, t.id);
    }
  }
  for (const group of byName.values()) {
    if (group.length > 1) err('duplicate-name', `Ci sono più tabelle chiamate ${q(group[0].name)}.`, ...group.map((t) => t.id));
  }
  return out;
}
