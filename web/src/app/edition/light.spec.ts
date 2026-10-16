import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { addAttribute, addEntity, addGeneralization, createDiagram, toggleIdentifierAttribute, updateAttribute } from '../domain/commands';
import { buildCarrozzeria } from '../domain/fixtures/carrozzeria';
import { EditorStore } from '../editor/editor-store';
import { Problems } from '../editor/problems/problems';
import { Properties } from '../editor/properties/properties';
import { EDITION as LIGHT } from './edition.light';
import { EDITION as FULL } from './edition';
import { EDITION_CONFIG } from './edition-token';
import * as domainLight from './logical-domain.light';
import * as uiLight from './logical-ui.light';

function light(): EditorStore {
  TestBed.configureTestingModule({ providers: [EditorStore, { provide: EDITION_CONFIG, useValue: LIGHT }] });
  return TestBed.inject(EditorStore);
}

describe('Rombo Light', () => {
  it('le due edizioni: la completa ha il logico, la Light no', () => {
    expect(FULL).toMatchObject({ light: false, logical: true, name: 'Rombo' });
    expect(LIGHT).toMatchObject({ light: true, logical: false, name: 'Rombo Light' });
  });

  it('i componenti del logico e dell\'SQL sono vuoti, senza schede né voci di palette', () => {
    expect(uiLight.LOGICAL_TABS).toEqual([]);
    expect(uiLight.LOGICAL_PALETTE).toEqual([]);
    TestBed.configureTestingModule({ providers: [EditorStore] });
    const stubs: Type<unknown>[] = [
      uiLight.LogicalCanvas, uiLight.LogicalProperties, uiLight.LogicalPanel, uiLight.SqlPanel, uiLight.RegenerateDialog,
      uiLight.TypePicker, uiLight.ModeSwitch, uiLight.LogicalExportItems, uiLight.LogicalReady,
    ];
    for (const c of stubs) {
      const f = TestBed.createComponent(c);
      f.detectChanges();
      expect((f.nativeElement as HTMLElement).innerHTML).toBe('');
    }
  });

  it('il modello logico non c\'è: niente schema, niente generazione', () => {
    expect(domainLight.toLogical(buildCarrozzeria())).toEqual({ tables: [], notes: [] });
    expect(() => domainLight.generateLogical(buildCarrozzeria())).toThrow('Non disponibile in Rombo Light');
    expect(domainLight.validateLogical(undefined)).toEqual([]);
    expect(domainLight.logicalBounds({ tables: [] })).toBeNull();
  });

  it('lo store non entra nel modo Logico e nasconde gli avvisi che riguardano solo la traduzione', () => {
    const s = light();
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = e.diagram;
    const k = addAttribute(d, e.id, 'CF'); d = toggleIdentifierAttribute(k.diagram, e.id, k.id);
    d = updateAttribute(d, k.id, { type: 'TEXT' });
    const tel = addAttribute(d, e.id, 'Telefono', '0,N'); d = tel.diagram;
    const c = addEntity(d, { x: 300, y: 0 }, 'Studente'); d = c.diagram;
    d = addGeneralization(d, e.id, [c.id]).diagram;
    s.load(d);
    const codes = s.issues().map((i) => i.code);
    expect(codes).not.toContain('text-in-key');
    expect(codes).not.toContain('multivalued-attribute');
    expect(codes).not.toContain('isa-default-strategy');
    s.setMode('logical');
    expect(s.mode()).toBe('er');
  });

  it('Proprietà e Problemi non parlano di chiavi esterne, strategie o schema logico', () => {
    const s = light();
    let d = createDiagram();
    const p = addEntity(d, { x: 0, y: 0 }, 'Persona'); d = p.diagram;
    const c = addEntity(d, { x: 300, y: 0 }, 'Studente'); d = c.diagram;
    const g = addGeneralization(d, p.id, [c.id]); d = g.diagram;
    s.load(d);
    s.select([g.id]);
    const props = TestBed.createComponent(Properties);
    props.detectChanges();
    const ptext = (props.nativeElement as HTMLElement).textContent!;
    expect(ptext).toContain('Copertura');
    expect(ptext).not.toContain('Traduzione nello schema logico');
    s.load(createDiagram());
    const probs = TestBed.createComponent(Problems);
    probs.detectChanges();
    const text = (probs.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Il diagramma ER è corretto.');
    expect(text).not.toContain('schema logico');
  });
});
