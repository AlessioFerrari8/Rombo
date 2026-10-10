import { TestBed } from '@angular/core/testing';
import { Component, inject } from '@angular/core';
import { buildCarrozzeria } from '../../domain/fixtures/carrozzeria';
import { addAttribute, addAttributePart, addEntity, createDiagram } from '../../domain/commands';
import { EditorStore } from '../editor-store';
import { Canvas } from './canvas';

@Component({ template: '<app-canvas />', imports: [Canvas], providers: [EditorStore] })
class Host {
  readonly store = inject(EditorStore);
}

function render(d = buildCarrozzeria()) {
  const f = TestBed.createComponent(Host);
  f.componentInstance.store.load(d);
  f.detectChanges();
  return { f, el: f.nativeElement as HTMLElement, store: f.componentInstance.store };
}

function press(target: Element) {
  const init = { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 } as PointerEventInit;
  const Ctor = (globalThis.PointerEvent ?? MouseEvent) as typeof PointerEvent;
  target.dispatchEvent(new Ctor('pointerdown', init));
  target.dispatchEvent(new Ctor('pointerup', init));
}

function pointerEvent(type: string, init: PointerEventInit): Event {
  const Ctor = (globalThis.PointerEvent ?? MouseEvent) as typeof PointerEvent;
  return new Ctor(type, { bubbles: true, ...init });
}

describe('Canvas', () => {
  it("disegna entita, associazioni e attributi dell'esercizio", () => {
    const { el } = render();
    expect(el.querySelectorAll('[data-entity]')).toHaveLength(4);
    expect(el.querySelectorAll('[data-rel]')).toHaveLength(3);
    expect(el.querySelectorAll('[data-attr]')).toHaveLength(16);
  });

  it("mostra il badge d'errore sull'entita senza identificatore", () => {
    const { el } = render(addEntity(createDiagram(), { x: 0, y: 0 }, 'Auto').diagram);
    expect(el.querySelector('[data-entity="Auto"] .er-error-badge')).toBeTruthy();
  });

  it("il click sul pallino mette l'attributo nell'identificatore", () => {
    const { f, el, store } = render();
    const dot = el.querySelector('[data-attr="Nome"] .er-dot')!;
    press(dot);
    f.detectChanges();
    const proprietario = store.diagram().entities.find((e) => e.name === 'Proprietario')!;
    expect(proprietario.primary!.attributeIds).toHaveLength(2);
  });

  it("l'attributo composto si disegna come ovale col nome, con le parti attorno e senza pallino", () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Studente'); d = e.diagram;
    const ind = addAttribute(d, e.id, 'indirizzo'); d = ind.diagram;
    for (const n of ['via', 'n. civico', 'CAP']) d = addAttributePart(d, ind.id, n).diagram;
    const { el } = render(d);
    const g = el.querySelector('[data-composite="indirizzo"]')!;
    expect(g.querySelector('ellipse')).toBeTruthy();
    expect(g.querySelector('.er-dot')).toBeNull();
    expect([...el.querySelectorAll('[data-part]')].map((x) => x.getAttribute('data-part'))).toEqual(['via', 'n. civico', 'CAP']);
  });

  it('azzera il rettangolo di selezione quando arriva un secondo puntatore (pinch)', () => {
    const { f, el } = render();
    const svg = el.querySelector('svg')!;
    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, shiftKey: true }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 200, clientY: 200 }));
    f.detectChanges();
    expect(el.querySelector('.er-marquee')).toBeTruthy();

    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 20, clientY: 20 }));
    f.detectChanges();
    expect(el.querySelector('.er-marquee')).toBeNull();
  });
});

function key(k: string, opts: KeyboardEventInit = {}, target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
}

function dblclick(target: Element): void {
  target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
}

function renameInputEl(el: HTMLElement): HTMLInputElement | null {
  return el.querySelector<HTMLInputElement>('input[aria-label="Nome"]');
}

describe('Canvas scorciatoie da tastiera', () => {
  it("'e' seleziona lo strumento entità", () => {
    const { f, store } = render();
    key('e');
    f.detectChanges();
    expect(store.tool()).toBe('entity');
  });

  it('Canc cancella la selezione', () => {
    const { f, store } = render();
    const entity = store.diagram().entities[0];
    store.select([entity.id]);
    f.detectChanges();
    key('Delete');
    f.detectChanges();
    expect(store.diagram().entities.some((e) => e.id === entity.id)).toBe(false);
  });

  it('Ctrl+Z annulla l\'ultima modifica', () => {
    const { f, store } = render();
    const before = store.diagram().entities.length;
    store.create((d) => addEntity(d, { x: 400, y: 400 }));
    f.detectChanges();
    expect(store.diagram().entities.length).toBe(before + 1);
    key('z', { ctrlKey: true });
    f.detectChanges();
    expect(store.diagram().entities.length).toBe(before);
  });

  it('ignora le scorciatoie quando il focus è in un campo di input', () => {
    const { f, el, store } = render();
    store.tool.set('select');
    const input = document.createElement('input');
    el.appendChild(input);
    input.focus();
    key('e', {}, input);
    f.detectChanges();
    expect(store.tool()).toBe('select');
    input.remove();
  });
});

describe('Canvas rinomina in linea', () => {
  it("il doppio clic su un'entità apre la casella con il nome attuale", () => {
    const { f, el, store } = render();
    const name = store.diagram().entities[0].name;
    dblclick(el.querySelector(`[data-entity="${name}"]`)!);
    f.detectChanges();
    const input = renameInputEl(el);
    expect(input).toBeTruthy();
    expect(input!.value).toBe(name);
  });

  it('Invio conferma la rinomina', () => {
    const { f, el, store } = render();
    const entity = store.diagram().entities[0];
    dblclick(el.querySelector(`[data-entity="${entity.name}"]`)!);
    f.detectChanges();
    const input = renameInputEl(el)!;
    input.value = 'Nuovo nome';
    key('Enter', {}, input);
    f.detectChanges();
    expect(store.diagram().entities.find((e) => e.id === entity.id)!.name).toBe('Nuovo nome');
    expect(renameInputEl(el)).toBeNull();
  });

  it('un blur successivo non genera un secondo passo di annullamento', () => {
    const { f, el, store } = render();
    const entity = store.diagram().entities[0];
    dblclick(el.querySelector(`[data-entity="${entity.name}"]`)!);
    f.detectChanges();
    const input = renameInputEl(el)!;
    input.value = 'Nuovo nome';
    key('Enter', {}, input);
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    f.detectChanges();
    expect(store.diagram().entities.find((e) => e.id === entity.id)!.name).toBe('Nuovo nome');
    expect(store.history().past.length).toBe(1);
  });

  it('Esc annulla senza modificare nulla', () => {
    const { f, el, store } = render();
    const entity = store.diagram().entities[0];
    dblclick(el.querySelector(`[data-entity="${entity.name}"]`)!);
    f.detectChanges();
    const input = renameInputEl(el)!;
    input.value = 'Scartato';
    key('Escape', {}, input);
    f.detectChanges();
    expect(store.diagram().entities.find((e) => e.id === entity.id)!.name).toBe(entity.name);
    expect(renameInputEl(el)).toBeNull();
    expect(store.history().past.length).toBe(0);
  });

  it('le scorciatoie da tastiera sono ignorate mentre la casella è aperta', () => {
    const { f, el, store } = render();
    const entity = store.diagram().entities[0];
    store.select([entity.id]);
    dblclick(el.querySelector(`[data-entity="${entity.name}"]`)!);
    f.detectChanges();
    key('Delete');
    f.detectChanges();
    expect(store.diagram().entities.some((e) => e.id === entity.id)).toBe(true);
  });

  it('usa il font display per entità e associazioni, il font sans per gli attributi', () => {
    const { f, el, store } = render();
    const entityName = store.diagram().entities[0].name;
    dblclick(el.querySelector(`[data-entity="${entityName}"]`)!);
    f.detectChanges();
    let input = renameInputEl(el)!;
    expect(input.classList.contains('font-display')).toBe(true);
    expect(input.classList.contains('font-sans')).toBe(false);
    key('Escape', {}, input);
    f.detectChanges();

    dblclick(el.querySelector('[data-attr="CF"] .er-label')!);
    f.detectChanges();
    input = renameInputEl(el)!;
    expect(input.classList.contains('font-sans')).toBe(true);
    expect(input.classList.contains('font-display')).toBe(false);
  });
});
