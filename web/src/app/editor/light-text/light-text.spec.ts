import { TestBed } from '@angular/core/testing';
import { buildCarrozzeria } from '../../domain/fixtures/carrozzeria';
import { EDITION as LIGHT } from '../../edition/edition.light';
import { EDITION_CONFIG } from '../../edition/edition-token';
import { EditorStore } from '../editor-store';
import { Analysis, ModelText } from './light-text';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore, { provide: EDITION_CONFIG, useValue: LIGHT }] });
  const store = TestBed.inject(EditorStore);
  store.load(buildCarrozzeria());
  return store;
}

describe('schede di testo di Rombo Light', () => {
  it('«Ricava dall\'ER» scrive il modello, colorato, e l\'undo lo toglie', () => {
    const store = setup();
    const f = TestBed.createComponent(ModelText);
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    f.detectChanges();
    expect(store.diagram().docs?.logical).toMatch(/^[A-Z_]+\(_/);
    const rows = (f.nativeElement as HTMLElement).querySelectorAll('[data-table]');
    expect(rows.length).toBeGreaterThan(1);
    store.undo();
    expect(store.diagram().docs?.logical).toBeUndefined();
  });

  it('la chiave esterna prende il colore della tabella puntata', () => {
    const store = setup();
    store.apply((d) => ({ ...d, docs: { logical: 'A(_x_)\nB(_y_, z→A)' } }));
    const f = TestBed.createComponent(ModelText);
    f.detectChanges();
    const spans = (f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-table] span');
    const color = (t: string) => [...spans].find((s) => s.textContent === t)!.style.color;
    expect(color('A')).not.toBe('');
    expect(color('z')).toBe(color('A'));
    expect(color('x')).toBe(color('A'));
  });

  it('l\'analisi si scrive, resta nel diagramma e «+ Scelta» numera', () => {
    const store = setup();
    const f = TestBed.createComponent(Analysis);
    f.detectChanges();
    const ta = (f.nativeElement as HTMLElement).querySelector('textarea')!;
    ta.value = 'Il problema';
    ta.dispatchEvent(new Event('input'));
    ta.dispatchEvent(new Event('blur'));
    expect(store.diagram().docs?.analysis).toBe('Il problema');
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelectorAll('button')[2].click();
    expect(store.diagram().docs?.analysis).toBe('Il problema\n\nScelta 1: ');
  });
});
