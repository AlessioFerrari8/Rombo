import { TestBed } from '@angular/core/testing';
import { buildNegozio } from '../../domain/fixtures/logical';
import { tableById } from '../../domain/model';
import { EditorStore } from '../editor-store';
import { LogicalProperties } from './logical-properties';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  const n = buildNegozio();
  store.load(n.d);
  store.setMode('logical');
  const f = TestBed.createComponent(LogicalProperties);
  f.detectChanges();
  return { f, store, n, el: f.nativeElement as HTMLElement };
}
const q = <T extends Element>(el: Element, sel: string) => el.querySelector<T>(sel)!;
const change = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('LogicalProperties', () => {
  it('senza selezione elenca le tabelle e permette di crearne una', () => {
    const { f, store, n, el } = setup();
    expect(el.textContent).toContain('Cliente');
    expect(el.textContent).toContain('Ordine');
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Cliente'))!.click();
    expect([...store.selection()]).toEqual([n.cliente]);
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Nuova tabella'))!.click();
    f.detectChanges();
    expect(store.diagram().logical!.tables).toHaveLength(3);
  });

  it('rinomina la tabella e aggiunge una colonna', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    f.detectChanges();
    change(q(el, 'input[aria-label="Nome della tabella"]'), 'Persona');
    expect(tableById(store.diagram(), n.cliente)!.name).toBe('Persona');
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Aggiungi colonna'))!.click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.cliente)!.columns).toHaveLength(3);
  });

  it('cambia PK, NULL e UNIQUE di una colonna', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    f.detectChanges();
    q<HTMLInputElement>(el, 'input[aria-label="Chiave primaria: nome"]').click();
    q<HTMLInputElement>(el, 'input[aria-label="Univoca: nome"]').click();
    f.detectChanges();
    const t = tableById(store.diagram(), n.cliente)!;
    expect(t.primaryKey).toHaveLength(2);
    expect(t.uniques).toHaveLength(1);
    expect(q<HTMLInputElement>(el, 'input[aria-label="Può essere NULL: nome"]').checked).toBe(false);
  });

  it('crea una FK scegliendo la tabella e la colonna', () => {
    const { f, store, n, el } = setup();
    store.select([n.ordine]);
    f.detectChanges();
    change(q(el, 'select[aria-label="Tabella riferita"]'), n.cliente);
    f.detectChanges();
    change(q(el, 'select[aria-label="Colonna per id"]'), n.oId);
    f.detectChanges();
    q<HTMLButtonElement>(el, 'button[data-add-fk]').click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toHaveLength(2);
  });

  it('con una FK selezionata mostra la sua tabella e permette di eliminarla', () => {
    const { f, store, n, el } = setup();
    store.select([n.fk]);
    f.detectChanges();
    expect(q<HTMLInputElement>(el, 'input[aria-label="Nome della tabella"]').value).toBe('Ordine');
    q<HTMLButtonElement>(el, 'button[data-del-fk]').click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toEqual([]);
  });

  it('elimina una colonna e la tabella', () => {
    const { f, store, n, el } = setup();
    store.select([n.ordine]);
    f.detectChanges();
    q<HTMLButtonElement>(el, 'button[aria-label="Elimina la colonna cliente_id"]').click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.columns).toHaveLength(1);
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toEqual([]);
    q<HTMLButtonElement>(el, 'button[data-del-table]').click();
    f.detectChanges();
    expect(store.diagram().logical!.tables).toHaveLength(1);
  });

  it('riordina le colonne', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    f.detectChanges();
    q<HTMLButtonElement>(el, 'button[aria-label="Sposta giù la colonna id"]').click();
    expect(tableById(store.diagram(), n.cliente)!.columns.map((c) => c.name)).toEqual(['nome', 'id']);
  });

  it('in sola lettura i campi sono bloccati', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    store.readonly.set(true);
    f.detectChanges();
    expect(q<HTMLInputElement>(el, 'input[aria-label="Nome della tabella"]').readOnly).toBe(true);
  });
});
