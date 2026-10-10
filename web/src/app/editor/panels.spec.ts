import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { addEntity } from '../domain/commands';
import { buildCarrozzeria } from '../domain/fixtures/carrozzeria';
import { buildNegozio } from '../domain/fixtures/logical';
import { renameTable } from '../domain/logical-commands';
import { EditorStore } from './editor-store';
import { LogicalPanel } from './logical-panel/logical-panel';
import { Problems } from './problems/problems';
import { Properties } from './properties/properties';
import { SqlPanel } from './sql-panel/sql-panel';

function store() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const s = TestBed.inject(EditorStore);
  s.load(buildCarrozzeria());
  return s;
}

describe('pannelli', () => {
  it('lo schema logico mostra le cinque tabelle con la chiave sottolineata', () => {
    store();
    const f = TestBed.createComponent(LogicalPanel);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-table]')).toHaveLength(5);
    expect(el.querySelector('[data-table="Auto"] .underline')!.textContent).toBe('Targa');
  });

  it("il click su un problema seleziona l'elemento", () => {
    const s = store();
    const id = s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Isolata'));
    s.select([]);
    const f = TestBed.createComponent(Problems);
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.alert-error')!.click();
    expect([...s.selection()]).toEqual([id]);
    expect(s.focusRequest()!.ids).toEqual([id]);
  });

  it("l'SQL cambia dialetto", () => {
    store();
    const f = TestBed.createComponent(SqlPanel);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('code')!.textContent).toContain('CREATE TABLE "Auto"');
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('MySQL'))!.click();
    f.detectChanges();
    expect(el.querySelector('code')!.textContent).toContain('CREATE TABLE `Auto`');
  });

  it('il massimo puo\' essere un numero, come (1,25)', () => {
    const s = store();
    const rel = s.diagram().relationships.find((r) => r.name === 'possiede')!;
    s.select([rel.id]);
    const f = TestBed.createComponent(Properties);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const max = el.querySelectorAll<HTMLSelectElement>('select[aria-label="Massimo"]')[0];
    max.value = 'num';
    max.dispatchEvent(new Event('change'));
    f.detectChanges();
    const num = el.querySelector<HTMLInputElement>('input[aria-label="Massimo (numero)"]')!;
    num.value = '25';
    num.dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(s.diagram().relationships.find((r) => r.id === rel.id)!.participants[0].max).toBe(25);
    expect(el.textContent).toContain('al massimo 25 volte');
  });

  it('il pannello di un attributo gestisce le parti; quello di una parte la rende opzionale', () => {
    const s = store();
    const auto = s.diagram().entities.find((e) => e.name === 'Proprietario')!;
    const attr = auto.attributes.find((a) => a.name === 'Nome')!;
    s.select([attr.id]);
    const f = TestBed.createComponent(Properties);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button[aria-label="Aggiungi una parte"]')!.click();
    el.querySelector<HTMLButtonElement>('button[aria-label="Aggiungi una parte"]')!.click();
    f.detectChanges();
    const parts = () => s.diagram().entities.find((e) => e.id === auto.id)!.attributes.find((a) => a.id === attr.id)!.parts!;
    expect(parts()).toHaveLength(2);
    const names = el.querySelectorAll<HTMLInputElement>('input[aria-label="Nome della parte"]');
    names[0].value = 'via';
    names[0].dispatchEvent(new Event('change'));
    expect(parts()[0].name).toBe('via');
    s.select([parts()[1].id]);
    f.detectChanges();
    expect(el.textContent).toContain('Parte di');
    const opt = el.querySelector<HTMLInputElement>('input[aria-label="Parte opzionale"]')!;
    opt.click();
    expect(parts()[1].card).toBe('0,1');
  });
});

describe('pannelli in modo Logico', () => {
  function setup<T>(cmp: Type<T>) {
    TestBed.configureTestingModule({ providers: [EditorStore] });
    const store = TestBed.inject(EditorStore);
    const n = buildNegozio();
    store.load(n.d);
    store.setMode('logical');
    const f = TestBed.createComponent(cmp);
    f.detectChanges();
    return { f, store, n, el: f.nativeElement as HTMLElement };
  }

  it('lo schema logico mostra le tabelle fatte a mano', () => {
    const { el } = setup(LogicalPanel);
    expect(el.querySelector('[data-table="Ordine"]')!.textContent).toContain('cliente_id→CLIENTE');
  });

  it("l'SQL contiene la FK dello schema a mano", () => {
    const { el } = setup(SqlPanel);
    expect(el.querySelector('pre')!.textContent).toContain('REFERENCES "Cliente" ("id")');
  });

  it('con errori il pannello Schema mostra il callout e non il testo', () => {
    const { f, store, n, el } = setup(LogicalPanel);
    store.apply((d) => renameTable(d, n.ordine, ''));
    f.detectChanges();
    expect(el.querySelector('.ui-callout')!.textContent).toContain('1 errori');
    expect(el.querySelector('[data-table]')).toBeNull();
  });

  it('il pannello Problemi elenca quelli del modo Logico', () => {
    const { f, store, n, el } = setup(Problems);
    store.apply((d) => renameTable(d, n.ordine, ''));
    f.detectChanges();
    expect(el.textContent).toContain('Una tabella non ha un nome');
    expect(el.textContent).not.toContain('identificatore');
  });

  it('senza tabelle lo schema dice come cominciare', () => {
    TestBed.configureTestingModule({ providers: [EditorStore] });
    const store = TestBed.inject(EditorStore);
    store.load({ ...buildNegozio().d, logical: undefined });
    store.setMode('logical');
    const f = TestBed.createComponent(LogicalPanel);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Nessuna tabella');
  });
});
