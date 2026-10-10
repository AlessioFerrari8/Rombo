import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { diagramSchema } from '../domain/serialize';
import { Diagram, Id } from '../domain/model';
import { Api, DiagramFull } from './api';
import { Auth } from './auth';
import { LocalDiagrams, LocalRecord } from './local-diagrams';
import { Toasts } from './toasts';

@Injectable({ providedIn: 'root' })
export class Sync {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly local = inject(LocalDiagrams);
  private readonly toasts = inject(Toasts);

  readonly conflicts = signal<ReadonlyMap<Id, DiagramFull>>(new Map());
  readonly pendingClaims = signal(0);
  readonly syncing = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;

  constructor() {
    // ogni scrittura locale, da collegati, fa partire un caricamento dopo 2 s
    effect(() => {
      this.local.revision();
      if (this.auth.user()) untracked(() => this.schedule());
    });
    // all'accesso: scarica quello che c'e' sul server e conta le bozze da assegnare
    effect(() => {
      if (this.auth.user()) {
        untracked(() => {
          void this.pull();
          void this.refreshClaims();
        });
      } else {
        // da ospite non c'e' un account a cui assegnare le bozze
        untracked(() => this.pendingClaims.set(0));
      }
    });
  }

  schedule(ms = 2000): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pushAll(), ms);
  }

  pushAll(): Promise<void> {
    if (!this.auth.user()) return Promise.resolve();
    this.running ??= this.doPush().finally(() => (this.running = null));
    return this.running;
  }

  private async doPush(): Promise<void> {
    this.syncing.set(true);
    try {
      for (const rec of await this.local.list()) {
        if (!rec.dirty || this.conflicts().has(rec.id)) continue;
        if (rec.serverVersion === null && !rec.uploadable) continue;
        await this.pushOne(rec);
        if (!this.auth.user()) return;
      }
    } finally {
      this.syncing.set(false);
    }
  }

  private async pushOne(rec: LocalRecord): Promise<void> {
    try {
      const res = rec.serverVersion === null ? await this.api.createDiagram(rec.diagram) : await this.api.updateDiagram(rec.diagram, rec.serverVersion);
      const now = await this.local.get(rec.id);
      if (!now) return; // cancellato nel frattempo
      await this.local.put({ ...now, serverVersion: res.version, dirty: now.updatedAt !== rec.updatedAt, uploadable: true });
    } catch (e) {
      if (!(e instanceof HttpErrorResponse)) return;
      if (e.status === 409 && rec.serverVersion !== null) {
        try {
          const server = await this.api.getDiagram(rec.id);
          this.conflicts.update((m) => new Map(m).set(rec.id, server));
        } catch {
          // riprova al prossimo giro
        }
      } else if (e.status === 409) {
        this.toasts.show('error', `«${rec.diagram.title}»: sul server c'è già un diagramma con lo stesso codice.`);
      } else if (e.status === 404 && rec.serverVersion !== null) {
        // cancellato altrove, oppure di un altro account (PC condiviso: chi e' uscito offline
        // ha lasciato modifiche): diventa una bozza da assegnare, mai caricata da sola
        await this.local.put({ ...rec, serverVersion: null, uploadable: false });
        await this.refreshClaims();
      } else if (e.status === 401) {
        this.auth.user.set(null);
      }
      // offline o server giu': si riprova alla prossima modifica
    }
  }

  async pull(): Promise<void> {
    let list;
    try {
      list = await this.api.listDiagrams();
    } catch {
      return;
    }
    for (const s of list) {
      const rec = await this.local.get(s.id);
      if (rec && (rec.dirty || (rec.serverVersion ?? -1) >= s.version)) continue;
      try {
        const full = await this.api.getDiagram(s.id);
        const parsed = diagramSchema.safeParse(full.content);
        if (!parsed.success) continue;
        await this.local.put({
          id: s.id,
          diagram: { ...(parsed.data as Diagram), id: s.id, title: full.title },
          serverVersion: full.version,
          dirty: false,
          updatedAt: Date.parse(full.updatedAt) || Date.now(),
          uploadable: true,
        });
      } catch {
        // riprova al prossimo accesso
      }
    }
  }

  async refreshClaims(): Promise<void> {
    const list = await this.local.list();
    this.pendingClaims.set(list.filter((r) => r.serverVersion === null && !r.uploadable).length);
  }

  /** «Caricale nel mio account»: le bozze nate da ospite su questo dispositivo. */
  async claimAll(): Promise<void> {
    if (!this.auth.user()) return;
    for (const r of await this.local.list()) {
      if (r.serverVersion === null && !r.uploadable) await this.local.put({ ...r, uploadable: true });
    }
    this.pendingClaims.set(0);
    await this.pushAll();
  }

  async resolveKeepMine(id: Id): Promise<void> {
    const server = this.conflicts().get(id);
    const rec = await this.local.get(id);
    this.dropConflict(id);
    if (!server || !rec) return;
    await this.local.put({ ...rec, serverVersion: server.version, dirty: true });
    await this.pushAll();
  }

  async resolveUseServer(id: Id): Promise<Diagram | null> {
    const server = this.conflicts().get(id);
    this.dropConflict(id);
    if (!server) return null;
    const parsed = diagramSchema.safeParse(server.content);
    if (!parsed.success) {
      this.toasts.show('error', 'La versione sul server non è leggibile: tengo la tua.');
      return null;
    }
    const diagram: Diagram = { ...(parsed.data as Diagram), id, title: server.title };
    await this.local.put({ id, diagram, serverVersion: server.version, dirty: false, updatedAt: Date.now(), uploadable: true });
    return diagram;
  }

  async deleteEverywhere(rec: LocalRecord): Promise<void> {
    await this.local.remove(rec.id);
    if (rec.serverVersion === null || !this.auth.user()) return;
    try {
      await this.api.deleteDiagram(rec.id);
    } catch (e) {
      if (!(e instanceof HttpErrorResponse && e.status === 404)) {
        this.toasts.show('warning', 'Eliminato da questo dispositivo, ma non dal server: riprova quando sei online.');
      }
    }
  }

  private dropConflict(id: Id): void {
    this.conflicts.update((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }
}
