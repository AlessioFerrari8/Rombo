import { buildNegozio } from './fixtures/logical';
import { HEADER_H, ROW_H, fkEdges, logicalBounds, rowY, tableAt, tableRect } from './logical-geometry';
import { tableById } from './model';

describe('geometria dello schema logico', () => {
  it('la tabella ha larghezza minima 176 (multipla di 16) e altezza da intestazione e righe', () => {
    const { d, cliente } = buildNegozio();
    const r = tableRect(tableById(d, cliente)!);
    expect(r).toEqual({ x: 0, y: 0, w: 176, h: HEADER_H + 2 * ROW_H + 6 });
  });

  it('una tabella senza colonne ha comunque una riga di altezza', () => {
    const { d, cliente } = buildNegozio();
    const t = { ...tableById(d, cliente)!, columns: [] };
    expect(tableRect(t).h).toBe(HEADER_H + ROW_H + 6);
  });

  it('i nomi lunghi allargano la tabella', () => {
    const { d, cliente } = buildNegozio();
    const t = { ...tableById(d, cliente)!, name: 'UnNomeDiTabellaMoltoLungoDavvero' };
    expect(tableRect(t).w).toBeGreaterThan(176);
    expect(tableRect(t).w % 16).toBe(0);
  });

  it('rowY e il centro verticale della riga', () => {
    const { d, ordine } = buildNegozio();
    const t = tableById(d, ordine)!;
    expect(rowY(t, 0)).toBe(HEADER_H + ROW_H / 2);
    expect(rowY(t, 1)).toBe(HEADER_H + ROW_H + ROW_H / 2);
  });

  it('la freccia FK esce dal lato sinistro di Ordine e arriva al lato destro di Cliente', () => {
    const { d, fk } = buildNegozio();
    const [e] = fkEdges(d.logical!);
    expect(e.id).toBe(fk);
    expect(e.points[0]).toEqual({ x: 400, y: 73 });
    expect(e.points.at(-1)).toEqual({ x: 176, y: 47 });
    expect(e.points).toEqual([{ x: 400, y: 73 }, { x: 288, y: 73 }, { x: 288, y: 47 }, { x: 176, y: 47 }]);
    expect(e.arrow[0]).toEqual({ x: 176, y: 47 });
    expect(e.arrow[1].x).toBe(186);
  });

  it('tabelle che si sovrappongono in orizzontale: la freccia gira dal lato destro', () => {
    const { d, ordine } = buildNegozio();
    const l = { tables: d.logical!.tables.map((t) => (t.id === ordine ? { ...t, pos: { x: 100, y: 200 } } : t)) };
    const [e] = fkEdges(l);
    const out = Math.max(...e.points.map((p) => p.x));
    expect(out).toBeGreaterThan(276); // oltre il bordo destro della piu' larga + margine
    expect(e.points[0].x).toBe(tableRect(l.tables[1]).x + tableRect(l.tables[1]).w);
  });

  it('una FK verso una tabella che non c\'e\' (file corrotto) viene ignorata', () => {
    const { d, ordine } = buildNegozio();
    const l = { tables: d.logical!.tables.filter((t) => t.id === ordine) };
    expect(fkEdges(l)).toEqual([]);
  });

  it('bounds copre tutte le tabelle; vuoto = null', () => {
    const { d } = buildNegozio();
    const b = logicalBounds(d.logical!)!;
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(400 + tableRect(d.logical!.tables[1]).w);
    expect(logicalBounds({ tables: [] })).toBeNull();
  });

  it('tableAt trova la tabella sotto il punto (l\'ultima vince)', () => {
    const { d, cliente, ordine } = buildNegozio();
    expect(tableAt(d.logical!, { x: 10, y: 10 })!.id).toBe(cliente);
    expect(tableAt(d.logical!, { x: 410, y: 10 })!.id).toBe(ordine);
    expect(tableAt(d.logical!, { x: 250, y: 10 })).toBeUndefined();
  });
});
