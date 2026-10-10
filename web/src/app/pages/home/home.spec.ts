import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocalDiagrams } from '../../core/local-diagrams';
import { createDiagram } from '../../domain/commands';
import { Home } from './home';

describe('Home', () => {
  it('elenca le bozze salvate in questo browser', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    await TestBed.inject(LocalDiagrams).saveDraft(createDiagram('Gestione Carrozzeria'));
    const f = TestBed.createComponent(Home);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Gestione Carrozzeria');
  });
});
