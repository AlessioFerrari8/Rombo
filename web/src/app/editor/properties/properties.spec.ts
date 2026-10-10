import { TestBed } from '@angular/core/testing';
import { buildCarrozzeria } from '../../domain/fixtures/carrozzeria';
import { EditorStore } from '../editor-store';
import { Properties } from './properties';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  store.load(buildCarrozzeria());
  const f = TestBed.createComponent(Properties);
  return { f, store, el: f.nativeElement as HTMLElement };
}

describe('Properties', () => {
  it("mostra l'entita selezionata e cambia l'identificatore", () => {
    const { f, store, el } = setup();
    const auto = store.diagram().entities.find((e) => e.name === 'Auto')!;
    store.select([auto.id]);
    f.detectChanges();
    expect((el.querySelector('input[aria-label="Nome dell\'entità"]') as HTMLInputElement).value).toBe('Auto');
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type=checkbox][title=Identificatore]');
    boxes[1].click(); // Modello
    expect(store.diagram().entities.find((e) => e.id === auto.id)!.primary!.attributeIds).toHaveLength(2);
  });

  it('cambia la cardinalita di un partecipante e spiega cosa vuol dire', () => {
    const { f, store, el } = setup();
    const possiede = store.diagram().relationships.find((r) => r.name === 'possiede')!;
    store.select([possiede.id]);
    f.detectChanges();
    expect(el.textContent).toContain('Ogni Proprietario partecipa almeno una volta, anche più volte.');
    const min = el.querySelector<HTMLSelectElement>('select[aria-label=Minimo]')!;
    min.value = '0';
    min.dispatchEvent(new Event('change'));
    expect(store.diagram().relationships.find((r) => r.id === possiede.id)!.participants[0].min).toBe(0);
  });
});
