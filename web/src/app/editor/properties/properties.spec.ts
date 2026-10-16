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

  it("entità debole: sceglie da sola l'identificante 1:N e spiega che (1,1) non vuol dire 1:1", () => {
    const { f, store, el } = setup();
    const ent = (n: string) => store.diagram().entities.find((e) => e.name === n)!;
    const rel = (n: string) => store.diagram().relationships.find((r) => r.name === n)!;
    store.select([ent('Intervento').id]);
    f.detectChanges();
    el.querySelector<HTMLInputElement>('input[aria-label="Entità debole"]')!.click();
    f.detectChanges();
    // «subisce» ha gia' Intervento (1,1): e' l'unica candidata pronta
    expect(ent('Intervento').weak).toBe(true);
    expect(ent('Intervento').primary!.externalVia).toEqual([rel('subisce').id]);
    expect(el.textContent).toContain('1:N');
    expect(el.textContent).not.toContain('serve (1,1)');
    // accendo anche «fa»: il lato di Intervento diventa (1,1), quello del proprietario (0,N)
    const fa = [...el.querySelectorAll<HTMLInputElement>('input[aria-label^="Identificante tramite"]')]
      .find((i) => i.getAttribute('aria-label')!.includes('«fa»'))!;
    fa.click();
    const parts = rel('fa').participants;
    expect(parts.find((p) => p.entityId === ent('Intervento').id)).toMatchObject({ min: 1, max: 1 });
    expect(parts.find((p) => p.entityId === ent('Dipendente').id)!.max).toBe('N');
  });
});
