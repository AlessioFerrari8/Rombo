import { TestBed } from '@angular/core/testing';
import { buildNegozio } from '../../domain/fixtures/logical';
import { EditorStore } from '../editor-store';
import { Palette } from './palette';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  store.load(buildNegozio().d);
  const f = TestBed.createComponent(Palette);
  f.detectChanges();
  return { f, store, el: f.nativeElement as HTMLElement };
}
const labels = (el: HTMLElement) => [...el.querySelectorAll('button.ui-tool')].map((b) => b.getAttribute('aria-label'));

describe('Palette', () => {
  it('in modo ER ha gli strumenti ER; in Logico Seleziona, Tabella e layout', () => {
    const { f, store, el } = setup();
    expect(labels(el)).toContain('Entità');
    store.setMode('logical');
    f.detectChanges();
    expect(labels(el)).toEqual(['Seleziona', 'Tabella', 'Sistema il layout']);
  });

  it('lo strumento Tabella attiva il tool "table"', () => {
    const { f, store, el } = setup();
    store.setMode('logical');
    f.detectChanges();
    (el.querySelector('button[aria-label="Tabella"]') as HTMLButtonElement).click();
    expect(store.tool()).toBe('table');
  });
});
