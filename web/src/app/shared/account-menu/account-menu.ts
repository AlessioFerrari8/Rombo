import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { Auth } from '../../core/auth';
import { Sync } from '../../core/sync';
import { Toasts } from '../../core/toasts';

@Component({ selector: 'app-account-menu', templateUrl: './account-menu.html', imports: [RouterLink] })
export class AccountMenu {
  protected readonly auth = inject(Auth);
  private readonly toasts = inject(Toasts);
  private readonly sync = inject(Sync);
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirmDelete');

  async logout(): Promise<void> {
    await this.sync.pushAll();
    const left = await this.auth.logout();
    this.toasts.show('info', left ? `Sei uscito. ${left} diagrammi hanno modifiche non caricate e restano su questo dispositivo.` : 'Sei uscito.');
  }

  askDelete(): void {
    this.confirmDialog().nativeElement.showModal();
  }

  async deleteAccount(): Promise<void> {
    this.confirmDialog().nativeElement.close();
    try {
      await this.auth.deleteAccount();
      this.toasts.show('info', 'Account e diagrammi sul server eliminati.');
    } catch (e) {
      this.toasts.show('error', apiError(e, 'Non riesco a eliminare l\'account: riprova.'));
    }
  }
}
