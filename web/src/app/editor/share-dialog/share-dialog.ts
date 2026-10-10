import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, apiError } from '../../core/api';
import { Auth } from '../../core/auth';
import { LocalDiagrams } from '../../core/local-diagrams';
import { Sync } from '../../core/sync';
import { Toasts } from '../../core/toasts';
import { EditorStore } from '../editor-store';

type State = 'guest' | 'loading' | 'not-uploaded' | 'none' | 'active' | 'error';

@Component({ selector: 'app-share-dialog', templateUrl: './share-dialog.html', imports: [RouterLink] })
export class ShareDialog {
  protected readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly sync = inject(Sync);
  private readonly local = inject(LocalDiagrams);
  private readonly toasts = inject(Toasts);
  private readonly store = inject(EditorStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly state = signal<State>('loading');
  protected readonly link = signal('');
  protected readonly message = signal('');

  async open(): Promise<void> {
    this.dialog().nativeElement.showModal();
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this.auth.user()) return this.state.set('guest');
    this.state.set('loading');
    await this.store.flush();
    const rec = await this.local.get(this.store.diagram().id);
    if (!rec || rec.serverVersion === null) return this.state.set('not-uploaded');
    try {
      this.setLink((await this.api.getShare(rec.id)).token);
    } catch (e) {
      if ((e as { status?: number }).status === 404) this.state.set('none');
      else this.fail(e);
    }
  }

  async upload(): Promise<void> {
    const id = this.store.diagram().id;
    const rec = await this.local.get(id);
    if (rec) await this.local.put({ ...rec, uploadable: true, dirty: true });
    await this.sync.pushAll();
    await this.refresh();
  }

  async create(): Promise<void> {
    try {
      this.setLink((await this.api.createShare(this.store.diagram().id)).token);
    } catch (e) {
      this.fail(e);
    }
  }

  async revoke(): Promise<void> {
    try {
      await this.api.revokeShare(this.store.diagram().id);
      this.state.set('none');
      this.toasts.show('info', 'Link disattivato: chi lo aveva non vede più il diagramma.');
    } catch (e) {
      this.fail(e);
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.toasts.show('success', 'Link copiato.');
    } catch {
      this.toasts.show('error', 'Non riesco a copiare: seleziona il link a mano.');
    }
  }

  private setLink(token: string): void {
    this.link.set(`${location.origin}/s/${token}`);
    this.state.set('active');
  }

  private fail(e: unknown): void {
    this.message.set(apiError(e, 'Qualcosa è andato storto.'));
    this.state.set('error');
  }
}
