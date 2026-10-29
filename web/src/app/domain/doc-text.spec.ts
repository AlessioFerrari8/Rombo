import { describe, expect, it } from 'vitest';
import { buildCarrozzeria } from './fixtures/carrozzeria';
import { docsToMarkdown, logicalToText, parseLogicalText, setDocs, tableColors } from './doc-text';
import { toLogical } from './logical';
import { parseDiagramFile, serializeDiagram } from './serialize';

describe('doc-text', () => {
  it('legge chiavi, chiavi esterne e nullable; il resto resta testo', () => {
    const lines = parseLogicalText('STUDENTE(_IdStudente_, Nome, fkCasa→CASA*)\n\n// ponte');
    expect(lines[0]).toEqual({
      kind: 'table', table: 'STUDENTE',
      columns: [
        { name: 'IdStudente', pk: true, fk: null, nullable: false },
        { name: 'Nome', pk: false, fk: null, nullable: false },
        { name: 'fkCasa', pk: false, fk: 'CASA', nullable: true },
      ],
    });
    expect(lines[1]).toEqual({ kind: 'text', text: '' });
    expect(lines[2]).toEqual({ kind: 'text', text: '// ponte' });
  });

  it('genera il testo dallo schema dell\'ER e lo rilegge', () => {
    const schema = toLogical(buildCarrozzeria());
    const lines = parseLogicalText(logicalToText(schema));
    const tables = lines.filter((l) => l.kind === 'table');
    expect(tables.map((t) => t.table)).toEqual(schema.tables.map((t) => t.name.toUpperCase()));
    expect(tables.every((t) => t.columns.some((c) => c.pk))).toBe(true);
  });

  it('un colore per tabella, stesso per chi la punta', () => {
    const colors = tableColors(parseLogicalText('A(_x_)\nB(_y_, z→A)'));
    expect([...colors.keys()]).toEqual(['A', 'B']);
    expect(colors.get('A')).not.toBe(colors.get('B'));
  });

  it('setDocs: aggiorna, toglie il vuoto e non cambia nulla se uguale', () => {
    const d = buildCarrozzeria();
    const a = setDocs(d, { analysis: 'Scelte' });
    expect(a.docs).toEqual({ analysis: 'Scelte' });
    expect(setDocs(a, { analysis: 'Scelte' })).toBe(a);
    expect(setDocs(a, { analysis: '' }).docs).toBeUndefined();
    expect(() => setDocs(d, { analysis: 'x'.repeat(60001) })).toThrow();
  });

  it('i testi sopravvivono a salvataggio e riapertura', () => {
    const d = setDocs(buildCarrozzeria(), { logical: 'A(_x_)', analysis: 'ciao' });
    const r = parseDiagramFile(serializeDiagram(d));
    expect(r.ok && r.diagram.docs).toEqual({ logical: 'A(_x_)', analysis: 'ciao' });
  });

  it('Markdown con analisi e modello', () => {
    const md = docsToMarkdown('Scuola', { analysis: 'Scelta 1', logical: 'A(_x_)' });
    expect(md).toContain('## Analisi del problema');
    expect(md).toContain('```\nA(_x_)\n```');
  });
});
