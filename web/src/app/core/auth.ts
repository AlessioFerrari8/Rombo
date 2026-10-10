import { Injectable, inject, signal } from '@angular/core';
import { Api, Me } from './api';
import { LocalDiagrams } from './local-diagrams';
import { isDesktop } from './platform';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(Api);
  private readonly local = inject(LocalDiagrams);
  /** undefined finche' non si sa; null = ospite. */
  readonly user = signal<Me | null | undefined>(undefined);

  async init(): Promise<void> {
    // l'app desktop e' solo locale: nessun server con cui parlare
    if (isDesktop) {
      this.user.set(null);
      return;
    }
    try {
      await this.api.csrf();
      this.user.set(await this.api.me());
    } catch {
      this.user.set(null);
    }
  }

  async login(email: string, password: string): Promise<void> {
    this.user.set(await this.api.login(email.trim(), password));
  }

  async register(email: string, password: string): Promise<void> {
    this.user.set(await this.api.register(email.trim(), password));
  }

  /** Esce e toglie dal dispositivo le copie gia' al sicuro sul server. Restituisce quante modifiche non caricate restano. */
  async logout(): Promise<number> {
    try {
      await this.api.logout();
    } finally {
      this.user.set(null);
    }
    return this.local.removeSynced();
  }

  async deleteAccount(): Promise<void> {
    await this.api.deleteMe();
    this.user.set(null);
    await this.local.removeServerCopies();
  }
}
