import { edit } from './commands';
import { LogicalSchema } from './logical';
import { DOCS_ANALYSIS_MAX, DOCS_LOGICAL_MAX, Diagram, Docs } from './model';

/** Una colonna di una riga del modello logico scritto a mano: `_Id_` chiave, `x→T` chiave esterna, `x*` nullable. */
export interface TextColumn { name: string; pk: boolean; fk: string | null; nullable: boolean }
/** Una riga: `TABELLA(col, col, ...)`; qualunque altra cosa (commenti, righe vuote) resta testo libero. */
export type TextLine = { kind: 'table'; table: string; columns: TextColumn[] } | { kind: 'text'; text: string };

const TABLE_LINE = /^\s*([^\s(][^(]*?)\s*\((.*)\)\s*$/;

export function parseLogicalText(text: string): TextLine[] {
  return text.split('\n').map((line): TextLine => {
    const m = TABLE_LINE.exec(line);
    if (!m || line.trimStart().startsWith('//')) return { kind: 'text', text: line };
    const columns = m[2].split(',').map((raw): TextColumn => {
      let s = raw.trim();
      const nullable = s.endsWith('*');
      if (nullable) s = s.slice(0, -1).trim();
      let fk: string | null = null;
      const arrow = s.search(/→|->/);
      if (arrow >= 0) {
        fk = s.slice(arrow).replace(/^→|^->/, '').trim() || null;
        s = s.slice(0, arrow).trim();
      }
      const pk = s.length > 2 && s.startsWith('_') && s.endsWith('_');
      return { name: pk ? s.slice(1, -1) : s, pk, fk, nullable };
    }).filter((c) => c.name);
    return { kind: 'table', table: m[1].trim(), columns };
  });
}

/** Testo di partenza ricavato dallo schema derivato dall'ER; poi lo si modifica a mano. */
export function logicalToText(s: LogicalSchema): string {
  return s.tables.map((t) => {
    const cols = t.columns.map((c) => {
      let out = t.primaryKey.includes(c.name) ? `_${c.name}_` : c.name;
      const fk = t.foreignKeys.find((f) => f.columns.includes(c.name));
      if (fk) out += `→${fk.refTable.toUpperCase()}`;
      if (c.nullable) out += '*';
      return out;
    });
    return `${t.name.toUpperCase()}(${cols.join(', ')})`;
  }).join('\n\n');
}

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

/** Colore per tabella (stesso ordine delle righe): le chiavi esterne prendono quello della tabella puntata. */
export function tableColors(lines: TextLine[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const l of lines) {
    if (l.kind === 'table' && !colors.has(l.table.toUpperCase())) colors.set(l.table.toUpperCase(), PALETTE[colors.size % PALETTE.length]);
  }
  return colors;
}

/** Aggiorna i testi: vuoto = tolto, e se non resta niente sparisce anche `docs`. */
export function setDocs(d: Diagram, patch: Docs): Diagram {
  const next: Docs = { ...d.docs, ...patch };
  if (next.logical !== undefined && next.logical.length > DOCS_LOGICAL_MAX) throw new Error('Modello logico troppo lungo');
  if (next.analysis !== undefined && next.analysis.length > DOCS_ANALYSIS_MAX) throw new Error('Analisi troppo lunga');
  if (!next.logical) delete next.logical;
  if (!next.analysis) delete next.analysis;
  if (next.logical === d.docs?.logical && next.analysis === d.docs?.analysis) return d;
  return edit(d, (x) => {
    if (Object.keys(next).length) x.docs = next;
    else delete x.docs;
  });
}

/** Analisi + modello logico in un solo file Markdown. */
export function docsToMarkdown(title: string, docs: Docs | undefined): string {
  const parts = [`# ${title}`];
  if (docs?.analysis) parts.push('## Analisi del problema', docs.analysis.trim());
  if (docs?.logical) parts.push('## Modello logico', '```\n' + docs.logical.trim() + '\n```');
  return parts.join('\n\n') + '\n';
}
