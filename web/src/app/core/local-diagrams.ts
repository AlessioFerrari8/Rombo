import { Injectable, signal } from '@angular/core';
import { Diagram, Id } from '../domain/model';

export interface LocalRecord {
  id: Id;
  diagram: Diagram;
  /** Versione sul server dell'ultima sincronizzazione; null se non e' mai stato caricato. */
  serverVersion: number | null;
  /** true se ci sono modifiche che il server non ha. */
  dirty: boolean;
  updatedAt: number;
  /** true se puo' finire nell'account di chi e' collegato. */
  uploadable?: boolean;
}

const DB_NAME = 'diagrammier';
const STORE = 'diagrams';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

@Injectable({ providedIn: 'root' })
export class LocalDiagrams {
  /** Cresce a ogni scrittura: home e sync lo leggono in un effect. */
  readonly revision = signal(0);
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(STORE, mode).objectStore(STORE);
  }

  async list(): Promise<LocalRecord[]> {
    const all = await request((await this.store('readonly')).getAll() as IDBRequest<LocalRecord[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: Id): Promise<LocalRecord | undefined> {
    return request((await this.store('readonly')).get(id) as IDBRequest<LocalRecord | undefined>);
  }

  async put(rec: LocalRecord): Promise<void> {
    await request((await this.store('readwrite')).put(rec));
    this.revision.update((n) => n + 1);
  }

  async saveDraft(d: Diagram, opts: { uploadable?: boolean } = {}): Promise<void> {
    const prev = await this.get(d.id);
    await this.put({
      id: d.id,
      diagram: d,
      serverVersion: prev?.serverVersion ?? null,
      dirty: true,
      updatedAt: Date.now(),
      uploadable: opts.uploadable ?? prev?.uploadable,
    });
  }

  async remove(id: Id): Promise<void> {
    await request((await this.store('readwrite')).delete(id));
    this.revision.update((n) => n + 1);
  }

  /** All'uscita dall'account: toglie dal dispositivo cio' che e' gia' al sicuro sul server. */
  async removeSynced(): Promise<number> {
    let dirtyLeft = 0;
    for (const r of await this.list()) {
      if (r.serverVersion !== null && !r.dirty) await this.remove(r.id);
      else if (r.serverVersion !== null) dirtyLeft++;
    }
    return dirtyLeft;
  }

  /** Dopo l'eliminazione dell'account: via da questo dispositivo tutto cio' che stava sul server. */
  async removeServerCopies(): Promise<void> {
    for (const r of await this.list()) if (r.serverVersion !== null) await this.remove(r.id);
  }
}
