import { SQL_TYPE_RE } from './model';
import { formatSqlType, parseSqlType } from './sql-type';

describe('sql-type', () => {
  it('legge e riscrive i tipi', () => {
    expect(parseSqlType('DECIMAL(8,2)')).toEqual({ base: 'DECIMAL', a: 8, b: 2 });
    expect(parseSqlType(undefined)).toEqual({ base: 'VARCHAR', a: 255, b: undefined });
    expect(formatSqlType({ base: 'DATE' })).toBe('DATE');
    expect(formatSqlType({ base: 'CHAR' })).toBe('CHAR(16)');
    expect(formatSqlType({ base: 'DECIMAL' })).toBe('DECIMAL(8,2)');
  });

  it('tiene i numeri dentro i limiti e produce sempre un tipo valido', () => {
    expect(formatSqlType({ base: 'DECIMAL', a: 5, b: 9 })).toBe('DECIMAL(5,5)');
    expect(formatSqlType({ base: 'VARCHAR', a: 0 })).toBe('VARCHAR(1)');
    expect(formatSqlType({ base: 'CHAR', a: 9999 })).toBe('CHAR(255)');
    for (const t of [{ base: 'VARCHAR', a: 70000 }, { base: 'DECIMAL', a: 99, b: 99 }, { base: 'BOOLEAN' }] as const) {
      expect(formatSqlType(t)).toMatch(SQL_TYPE_RE);
    }
  });
});
