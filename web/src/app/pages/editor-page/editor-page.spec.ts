import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocalDiagrams } from '../../core/local-diagrams';
import { buildNegozio } from '../../domain/fixtures/logical';
import { EditorPage } from './editor-page';

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const d = buildNegozio().d;
  await TestBed.inject(LocalDiagrams).saveDraft(d);
  const f = TestBed.createComponent(EditorPage);
  f.componentRef.setInput('id', d.id);
  f.detectChanges();
  await vi.waitFor(() => {
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-canvas, app-logical-canvas')).not.toBeNull();
  });
  return { f, el: f.nativeElement as HTMLElement };
}

const segment = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('.ui-segment')].find((b) => b.textContent!.trim() === label)!;

describe('EditorPage', () => {
  it('l\'interruttore ER | Logico monta un solo canvas alla volta', async () => {
    const { f, el } = await render();
    expect(el.querySelectorAll('app-canvas')).toHaveLength(1);
    expect(el.querySelector('app-logical-canvas')).toBeNull();
    expect(segment(el, 'ER').getAttribute('aria-pressed')).toBe('true');

    segment(el, 'Logico').click();
    f.detectChanges();
    expect(el.querySelector('app-canvas')).toBeNull();
    expect(el.querySelectorAll('app-logical-canvas')).toHaveLength(1);
    expect(segment(el, 'Logico').getAttribute('aria-pressed')).toBe('true');
    expect(segment(el, 'ER').getAttribute('aria-pressed')).toBe('false');

    segment(el, 'ER').click();
    f.detectChanges();
    expect(el.querySelectorAll('app-canvas')).toHaveLength(1);
    expect(el.querySelector('app-logical-canvas')).toBeNull();
  });
});
