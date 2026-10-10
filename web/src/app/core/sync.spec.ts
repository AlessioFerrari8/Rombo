import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { createDiagram } from '../domain/commands';
import { Auth } from './auth';
import { LocalDiagrams } from './local-diagrams';
import { Sync } from './sync';

async function waitFor(http: HttpTestingController, method: string, url: string): Promise<TestRequest> {
  for (let i = 0; i < 100; i++) {
    const found = http.match((r) => r.method === method && r.url === url);
    if (found.length) return found[0];
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`nessuna richiesta ${method} ${url}`);
}

function setup() {
  // un database pulito per test: i record di un test non devono finire nel push del successivo
  globalThis.indexedDB = new IDBFactory();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(Auth).user.set({ id: 'u1', email: 'a@b.it' });
  return { sync: TestBed.inject(Sync), local: TestBed.inject(LocalDiagrams), http: TestBed.inject(HttpTestingController) };
}

describe('Sync', () => {
  it('carica una bozza nuova e la segna sincronizzata', async () => {
    const { sync, local, http } = setup();
    const d = createDiagram('Nuovo');
    await local.saveDraft(d, { uploadable: true });
    const done = sync.pushAll();
    const req = await waitFor(http, 'POST', '/api/diagrams');
    expect(req.request.body.id).toBe(d.id);
    req.flush({ id: d.id, title: 'Nuovo', content: d, version: 0, updatedAt: '2026-09-23T20:00:00Z' });
    await done;
    expect(await local.get(d.id)).toMatchObject({ serverVersion: 0, dirty: false });
  });

  it('non carica le bozze nate da ospite, ma le conta', async () => {
    const { sync, local, http } = setup();
    const d = createDiagram('Di un compagno');
    await local.saveDraft(d);
    await sync.pushAll();
    expect(http.match((r) => r.method === 'POST' && r.body?.id === d.id)).toHaveLength(0);
    await sync.refreshClaims();
    expect(sync.pendingClaims()).toBeGreaterThanOrEqual(1);
  });

  it('un 409 diventa un conflitto con la versione del server', async () => {
    const { sync, local, http } = setup();
    const d = createDiagram('Conteso');
    await local.put({ id: d.id, diagram: d, serverVersion: 3, dirty: true, updatedAt: 1, uploadable: true });
    const done = sync.pushAll();
    (await waitFor(http, 'PUT', `/api/diagrams/${d.id}`)).flush(
      { error: 'Il diagramma è stato modificato altrove.', version: 4, updatedAt: 'x' },
      { status: 409, statusText: 'Conflict' },
    );
    (await waitFor(http, 'GET', `/api/diagrams/${d.id}`)).flush({ id: d.id, title: 'Da altrove', content: d, version: 4, updatedAt: '2026-09-23T20:00:00Z' });
    await done;
    expect(sync.conflicts().get(d.id)?.version).toBe(4);
    expect((await local.get(d.id))!.dirty).toBe(true);
  });

  it('una modifica arrivata durante il caricamento resta da sincronizzare', async () => {
    const { sync, local, http } = setup();
    const d = createDiagram('In corsa');
    await local.saveDraft(d, { uploadable: true });
    const done = sync.pushAll();
    const req = await waitFor(http, 'POST', '/api/diagrams');
    await local.saveDraft({ ...d, title: 'Cambiato nel frattempo' });
    req.flush({ id: d.id, title: 'In corsa', content: d, version: 0, updatedAt: 'x' });
    await done;
    expect(await local.get(d.id)).toMatchObject({ serverVersion: 0, dirty: true });
  });

  it("un 404 in aggiornamento non ricarica il diagramma nell'account di chi e' collegato", async () => {
    // PC condiviso: A e' uscito offline lasciando modifiche, ora e' collegato B
    const { sync, local, http } = setup();
    const d = createDiagram('Di A');
    await local.put({ id: d.id, diagram: d, serverVersion: 2, dirty: true, updatedAt: 1, uploadable: true });
    const done = sync.pushAll();
    (await waitFor(http, 'PUT', `/api/diagrams/${d.id}`)).flush({ error: 'Diagramma non trovato.' }, { status: 404, statusText: 'Not Found' });
    await done;
    await sync.pushAll();
    expect(http.match((r) => r.method === 'POST' && r.url === '/api/diagrams')).toHaveLength(0);
    expect(await local.get(d.id)).toMatchObject({ serverVersion: null, uploadable: false });
  });

  it("da ospite non si possono assegnare le bozze, e il conteggio si azzera all'uscita", async () => {
    const { sync, local } = setup();
    const d = createDiagram('Di un compagno');
    await local.saveDraft(d);
    await sync.refreshClaims();
    expect(sync.pendingClaims()).toBe(1);
    TestBed.inject(Auth).user.set(null);
    TestBed.tick();
    expect(sync.pendingClaims()).toBe(0);
    await sync.claimAll();
    expect((await local.get(d.id))!.uploadable).toBeFalsy();
  });
});
