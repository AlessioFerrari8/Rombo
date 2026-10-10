import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { createDiagram } from '../domain/commands';
import { serializeDiagram } from '../domain/serialize';
import { DIAGRAM_FILE_ACCEPT, DiagramFiles, diagramFileName, openFailureMessage } from './diagram-files';
import { LocalDiagrams } from './local-diagrams';
import { Toasts } from './toasts';

describe('diagramFileName', () => {
  it('propone un .rombo dal titolo', () => {
    expect(diagramFileName('Gestione Carrozzeria')).toBe('gestione-carrozzeria.rombo');
    expect(diagramFileName('  ')).toBe('diagramma.rombo');
  });

  it('"Apri file" accetta .rombo e .json', () => {
    expect(DIAGRAM_FILE_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.rombo', '.json']));
  });

  it('spiega perche\' un file non si apre', () => {
    expect(openFailureMessage('a.rombo', 'too-big')).toContain('2 MB');
    expect(openFailureMessage('a.txt', 'extension')).toContain('«a.txt»');
    expect(openFailureMessage('a.rombo', 'unreadable')).toBe('Impossibile leggere «a.rombo».');
  });
});

describe('DiagramFiles', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const show = vi.spyOn(TestBed.inject(Toasts), 'show');
    return { files: TestBed.inject(DiagramFiles), local: TestBed.inject(LocalDiagrams), navigate, show };
  }

  it('importa un diagramma, lo salva e apre l\'editor', async () => {
    const { files, local, navigate, show } = setup();
    const d = createDiagram('Da file');
    expect(await files.importText(serializeDiagram(d))).toBe(true);
    // l'import assegna un id nuovo: si puo' riaprire lo stesso file piu' volte
    const id = (navigate.mock.calls[0][0] as string[])[1];
    expect(id).not.toBe(d.id);
    expect((await local.get(id))?.diagram.title).toBe('Da file');
    expect(show).not.toHaveBeenCalledWith('error', expect.anything(), expect.anything());
  });

  it('rifiuta JSON non valido con un toast, senza navigare', async () => {
    const { files, navigate, show } = setup();
    expect(await files.importText('{rotto')).toBe(false);
    expect(show).toHaveBeenCalledWith('error', 'Il file non è JSON valido.', 8000);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('crea un diagramma nuovo e lo apre', async () => {
    const { files, local, navigate } = setup();
    await files.create();
    const id = (navigate.mock.calls[0][0] as string[])[1];
    expect(await local.get(id)).toBeDefined();
  });
});
