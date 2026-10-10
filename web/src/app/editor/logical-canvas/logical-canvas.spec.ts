import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildNegozio } from '../../domain/fixtures/logical';
import { tableById } from '../../domain/model';
import { EditorStore } from '../editor-store';
import { LogicalCanvas } from './logical-canvas';

@Component({ template: '<app-logical-canvas />', imports: [LogicalCanvas], providers: [EditorStore] })
class Host {
  readonly store = inject(EditorStore);
}

function render() {
  const f = TestBed.createComponent(Host);
  const n = buildNegozio();
  f.componentInstance.store.load(n.d);
  f.componentInstance.store.setMode('logical');
  f.detectChanges();
  return { f, el: f.nativeElement as HTMLElement, store: f.componentInstance.store, n };
}

function press(target: Element, type = 'pointerdown') {
  const Ctor = (globalThis.PointerEvent ?? MouseEvent) as typeof PointerEvent;
  target.dispatchEvent(new Ctor(type, { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }));
}

describe('LogicalCanvas', () => {
  it('disegna le tabelle, le colonne e le frecce FK', () => {
    const { el } = render();
    expect(el.querySelectorAll('[data-ltable]')).toHaveLength(2);
    expect(el.querySelector('[data-ltable="Ordine"]')!.querySelectorAll('[data-lcol]')).toHaveLength(2);
    expect(el.querySelectorAll('.lg-fk')).toHaveLength(1);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Schema logico');
  });

  it('la chiave primaria e sottolineata e la colonna opzionale ha l\'asterisco', () => {
    const { el } = render();
    const cliente = el.querySelector('[data-ltable="Cliente"]')!;
    expect(cliente.querySelector('[data-lcol="id"] .lg-col')!.classList.contains('is-pk')).toBe(true);
    expect(cliente.querySelector('[data-lcol="nome"]')!.textContent).toContain('*');
    expect(cliente.querySelector('[data-lcol="id"]')!.textContent).not.toContain('*');
  });

  it('clic su una tabella la seleziona; clic sul fondo deseleziona', () => {
    const { f, el, store, n } = render();
    press(el.querySelector('[data-ltable="Cliente"]')!);
    press(el.querySelector('[data-ltable="Cliente"]')!, 'pointerup');
    f.detectChanges();
    expect([...store.selection()]).toEqual([n.cliente]);
    expect(el.querySelector('[data-ltable="Cliente"] .er-selected')).not.toBeNull();
    press(el.querySelector('svg')!);
    press(el.querySelector('svg')!, 'pointerup');
    expect(store.selection().size).toBe(0);
  });

  it('clic su una freccia seleziona la FK', () => {
    const { el, store, n } = render();
    press(el.querySelector('.lg-fk')!);
    press(el.querySelector('.lg-fk')!, 'pointerup');
    expect([...store.selection()]).toEqual([n.fk]);
  });

  it('doppio clic sul nome della tabella la rinomina', () => {
    const { f, el, store, n } = render();
    el.querySelector('[data-ltable="Cliente"] .er-name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    f.detectChanges();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Nome"]')!;
    input.value = 'Persona';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.detectChanges();
    expect(tableById(store.diagram(), n.cliente)!.name).toBe('Persona');
    expect(el.querySelector('[data-ltable="Persona"]')).not.toBeNull();
  });

  it('doppio clic su una colonna la rinomina e le FK la seguono', () => {
    const { f, el, store, n } = render();
    el.querySelector('[data-ltable="Ordine"] [data-lcol="cliente_id"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    f.detectChanges();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Nome"]')!;
    input.value = 'idCliente';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.columns[1].name).toBe('idCliente');
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toHaveLength(1);
  });

  it('Canc elimina la tabella selezionata e Ctrl+Z la riporta', () => {
    const { f, el, store, n } = render();
    store.select([n.cliente]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    f.detectChanges();
    expect(el.querySelector('[data-ltable="Cliente"]')).toBeNull();
    expect(el.querySelectorAll('.lg-fk')).toHaveLength(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    f.detectChanges();
    expect(el.querySelector('[data-ltable="Cliente"]')).not.toBeNull();
  });

  it('Backspace con una FK selezionata la elimina e lascia le tabelle', () => {
    const { f, el, store, n } = render();
    press(el.querySelector('.lg-fk')!);
    press(el.querySelector('.lg-fk')!, 'pointerup');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toEqual([]);
    expect(el.querySelectorAll('[data-ltable]')).toHaveLength(2);
    expect(el.querySelectorAll('.lg-fk')).toHaveLength(0);
    expect(store.selection().size).toBe(0);
  });

  it('senza tabelle mostra come cominciare', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.store.load({ ...buildNegozio().d, logical: undefined });
    f.componentInstance.store.setMode('logical');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nessuna tabella');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent!.includes("Genera dall'ER"))).toBe(true);
  });
});
