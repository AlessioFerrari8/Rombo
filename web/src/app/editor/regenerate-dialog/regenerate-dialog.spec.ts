import { TestBed } from '@angular/core/testing';
import { buildCarrozzeria } from '../../domain/fixtures/carrozzeria';
import { buildNegozio } from '../../domain/fixtures/logical';
import { EditorStore } from '../editor-store';
import { RegenerateDialog } from './regenerate-dialog';

// jsdom non implementa showModal()/close() di <dialog>: bastano per l'attributo open.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  store.load({ ...buildCarrozzeria(), logical: buildNegozio().d.logical });
  const f = TestBed.createComponent(RegenerateDialog);
  f.detectChanges();
  return { f, store, el: f.nativeElement as HTMLElement };
}

describe('RegenerateDialog', () => {
  it('si apre quando serve la conferma e Annulla la chiude senza toccare lo schema', () => {
    const { f, store, el } = setup();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBe(false);
    store.requestGenerate();
    f.detectChanges();
    expect(dialog.open).toBe(true);
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Annulla'))!.click();
    f.detectChanges();
    expect(store.confirmRegenerate()).toBe(false);
    expect(dialog.open).toBe(false);
    expect(store.diagram().logical!.tables.map((t) => t.name)).toEqual(['Cliente', 'Ordine']);
  });

  it('Sostituisci rigenera dall\'ER', async () => {
    const { f, store, el } = setup();
    store.requestGenerate();
    f.detectChanges();
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Sostituisci'))!.click();
    await vi.waitFor(() => expect(store.diagram().logical!.tables).toHaveLength(5));
    expect(store.confirmRegenerate()).toBe(false);
  });
});
