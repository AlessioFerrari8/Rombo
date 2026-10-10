import { DEFAULT_SQL_TYPE } from './model';

export type SqlBase = 'VARCHAR' | 'CHAR' | 'TEXT' | 'INT' | 'BIGINT' | 'DECIMAL' | 'DATE' | 'TIMESTAMP' | 'BOOLEAN';

export interface SqlTypeParts {
  base: SqlBase;
  a?: number;
  b?: number;
}

interface BaseInfo {
  base: SqlBase;
  label: string;
  params: 0 | 1 | 2;
  defaults: [number, number];
  maxA: number;
}

export const SQL_BASES: BaseInfo[] = [
  { base: 'VARCHAR', label: 'Testo (VARCHAR)', params: 1, defaults: [255, 0], maxA: 65535 },
  { base: 'CHAR', label: 'Testo fisso (CHAR)', params: 1, defaults: [16, 0], maxA: 255 },
  { base: 'TEXT', label: 'Testo lungo (TEXT)', params: 0, defaults: [0, 0], maxA: 0 },
  { base: 'INT', label: 'Intero (INT)', params: 0, defaults: [0, 0], maxA: 0 },
  { base: 'BIGINT', label: 'Intero grande (BIGINT)', params: 0, defaults: [0, 0], maxA: 0 },
  { base: 'DECIMAL', label: 'Decimale (DECIMAL)', params: 2, defaults: [8, 2], maxA: 38 },
  { base: 'DATE', label: 'Data (DATE)', params: 0, defaults: [0, 0], maxA: 0 },
  { base: 'TIMESTAMP', label: 'Data e ora (TIMESTAMP)', params: 0, defaults: [0, 0], maxA: 0 },
  { base: 'BOOLEAN', label: 'Sì/No (BOOLEAN)', params: 0, defaults: [0, 0], maxA: 0 },
];

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));

export function parseSqlType(s: string | undefined): SqlTypeParts {
  const m = /^([A-Z]+)(?:\((\d+)(?:,(\d+))?\))?$/.exec(s ?? DEFAULT_SQL_TYPE);
  if (!m || !SQL_BASES.some((b) => b.base === m[1])) return { base: 'VARCHAR', a: 255, b: undefined };
  return { base: m[1] as SqlBase, a: m[2] ? Number(m[2]) : undefined, b: m[3] ? Number(m[3]) : undefined };
}

export function formatSqlType(p: SqlTypeParts): string {
  const info = SQL_BASES.find((b) => b.base === p.base)!;
  if (info.params === 0) return p.base;
  const a = clampInt(p.a ?? info.defaults[0], 1, info.maxA);
  if (info.params === 1) return `${p.base}(${a})`;
  const b = clampInt(p.b ?? info.defaults[1], 0, Math.min(a, 30));
  return `${p.base}(${a},${b})`;
}
