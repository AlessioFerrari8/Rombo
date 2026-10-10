import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createDiagram } from '../domain/commands';
import { serializeDiagram } from '../domain/serialize';
import { DesktopBridge } from './desktop-bridge';
import { DiagramFiles } from './diagram-files';
import { DesktopMenuCommand, DesktopOpenedFile, RomboBridge, desktopBridge } from './platform';
import { Toasts } from './toasts';

function fakeBridge() {
  let open: ((f: DesktopOpenedFile) => void) | null = null;
  let menu: ((c: DesktopMenuCommand) => void) | null = null;
  const calls: string[] = [];
  const bridge: RomboBridge = {
    desktop: true,
    platform: 'linux',
    onOpenFile: (cb) => { calls.push('onOpenFile'); open = cb; },
    onMenu: (cb) => { calls.push('onMenu'); menu = cb; },
    saveFile: vi.fn(async (name: string) => ({ ok: true as const, name })),
  };
  return { bridge, calls, open: (f: DesktopOpenedFile) => open!(f), menu: (c: DesktopMenuCommand) => menu!(c) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('desktopBridge', () => {
  it('nel browser non c\'e\' e non lancia', () => {
    expect(desktopBridge({})).toBeNull();
    expect(desktopBridge(undefined)).toBeNull();
  });

  it('un preload incompleto non conta come ponte', () => {
    expect(desktopBridge({ rombo: { desktop: true, platform: 'linux' } as unknown as RomboBridge })).toBeNull();
    expect(desktopBridge({ rombo: fakeBridge().bridge })).not.toBeNull();
  });
});

describe('DesktopBridge', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const files = TestBed.inject(DiagramFiles);
    const importText = vi.spyOn(files, 'importText').mockResolvedValue(true);
    const create = vi.spyOn(files, 'create').mockResolvedValue();
    const show = vi.spyOn(TestBed.inject(Toasts), 'show');
    const fake = fakeBridge();
    const svc = TestBed.inject(DesktopBridge);
    return { svc, fake, importText, create, show };
  }

  it('senza ponte resta spento', () => {
    const { svc } = setup();
    svc.init(null);
    expect(svc.available).toBe(false);
  });

  it('registra il menu prima di dichiararsi pronto, una volta sola', () => {
    const { svc, fake } = setup();
    svc.init(fake.bridge);
    svc.init(fake.bridge);
    expect(fake.calls).toEqual(['onMenu', 'onOpenFile']);
  });

  it('importa i file aperti dal sistema, in ordine', async () => {
    const { svc, fake, importText, show } = setup();
    svc.init(fake.bridge);
    fake.open({ ok: true, name: 'a.rombo', text: 'A' });
    fake.open({ ok: false, name: 'b.rombo', reason: 'too-big' });
    fake.open({ ok: true, name: 'c.json', text: 'C' });
    await tick();
    expect(importText.mock.calls.map((c) => c[0])).toEqual(['A', 'C']);
    expect(show).toHaveBeenCalledWith('error', 'Il file è troppo grande (massimo 2 MB).', 8000);
  });

  it('menu: nuovo diagramma e salva con nome', async () => {
    const { svc, fake, create, show } = setup();
    svc.init(fake.bridge);
    fake.menu('new');
    expect(create).toHaveBeenCalled();

    fake.menu('save-as');
    await tick();
    expect(show).toHaveBeenCalledWith('info', 'Apri un diagramma per salvarlo con nome.');

    const d = createDiagram('Officina');
    svc.setCurrent(() => d);
    fake.menu('save-as');
    await tick();
    expect(fake.bridge.saveFile).toHaveBeenCalledWith('officina.rombo', serializeDiagram(d));
    expect(show).toHaveBeenCalledWith('success', 'Salvato «officina.rombo».');
  });

  it('annullare il dialog non e\' un errore', async () => {
    const { svc, fake, show } = setup();
    vi.mocked(fake.bridge.saveFile).mockResolvedValue({ ok: false, reason: 'canceled' });
    svc.init(fake.bridge);
    await svc.saveAs(createDiagram('X'));
    expect(show).not.toHaveBeenCalled();
  });
});
