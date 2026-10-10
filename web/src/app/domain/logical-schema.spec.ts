import { toDDL } from './ddl';
import { buildCarrozzeria } from './fixtures/carrozzeria';
import { buildNegozio } from './fixtures/logical';
import { addAttribute, addEntity, createDiagram, setAlternates, toggleIdentifierAttribute } from './commands';
import { formatLogical, toLogical } from './logical';
import { renameTable, updateColumn } from './logical-commands';
import { generateLogical, toTables } from './logical-schema';
import { tableRect } from './logical-geometry';

describe('toTables', () => {
  it('converte id in nomi e mantiene PK, FK, UNIQUE e CHECK', () => {
    const { d, ordine, oCliente } = buildNegozio();
    const l = {
      tables: d.logical!.tables.map((t) =>
        t.id === ordine ? { ...t, uniques: [[oCliente]], checks: [{ columnId: oCliente, values: ['a', "b'c"] }] } : t),
    };
    const s = toTables(l);
    expect(s.notes).toEqual([]);
    const o = s.tables.find((t) => t.name === 'Ordine')!;
    expect(o.primaryKey).toEqual(['id']);
    expect(o.foreignKeys).toEqual([{ columns: ['cliente_id'], refTable: 'Cliente', refColumns: ['id'] }]);
    expect(o.uniques).toEqual([['cliente_id']]);
    expect(o.checks).toEqual([{ column: 'cliente_id', values: ['a', "b'c"] }]);
  });

  it('la notazione e il SQL seguono i nomi rinominati a mano', () => {
    let { d, cliente, ordine, oCliente } = buildNegozio();
    d = renameTable(d, cliente, 'Persona');
    d = updateColumn(d, ordine, oCliente, { name: 'persona_id' });
    const text = formatLogical(toTables(d.logical!)).split('\n');
    expect(text[0]).toBe('PERSONA(_id_, nome*)');
    expect(text[1]).toBe('ORDINE(_id_, persona_id→PERSONA*)');
    const sql = toDDL(toTables(d.logical!), 'postgres');
    expect(sql).toContain('FOREIGN KEY ("persona_id") REFERENCES "Persona" ("id")');
  });
});

describe('generateLogical', () => {
  it('da lo stesso SQL e la stessa notazione dello schema derivato (carrozzeria)', () => {
    const d = buildCarrozzeria();
    const derived = toLogical(d);
    const hand = toTables(generateLogical(d));
    expect(hand.tables).toHaveLength(derived.tables.length);
    for (const dialect of ['postgres', 'mysql'] as const) {
      expect(toDDL(hand, dialect)).toBe(toDDL(derived, dialect));
    }
    expect(formatLogical({ ...hand, notes: derived.notes })).toBe(formatLogical(derived));
  });

  it('mappa le chiavi alternative in UNIQUE', () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona');
    d = e.diagram;
    const cf = addAttribute(d, e.id, 'CF');
    d = toggleIdentifierAttribute(cf.diagram, e.id, cf.id);
    const mail = addAttribute(d, e.id, 'Email');
    d = setAlternates(mail.diagram, e.id, [[mail.id]]);
    const t = toTables(generateLogical(d)).tables[0];
    expect(t.uniques).toEqual([['Email']]);
  });

  it('assegna id diversi a ogni chiamata e posizioni senza sovrapposizioni', () => {
    const d = buildCarrozzeria();
    const a = generateLogical(d);
    const b = generateLogical(d);
    expect(a.tables[0].id).not.toBe(b.tables[0].id);
    const rects = a.tables.map(tableRect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const p = rects[i];
        const q = rects[j];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('il risultato passa la validazione di riferimenti del file', async () => {
    const { parseDiagramFile, serializeDiagram } = await import('./serialize');
    const d = { ...buildCarrozzeria(), logical: generateLogical(buildCarrozzeria()) };
    expect(parseDiagramFile(serializeDiagram(d)).ok).toBe(true);
  });
});
