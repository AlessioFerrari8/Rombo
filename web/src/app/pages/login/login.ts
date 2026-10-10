import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { Auth } from '../../core/auth';
import { Toasts } from '../../core/toasts';

@Component({ selector: 'app-login', templateUrl: './login.html', imports: [RouterLink] })
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  async submit(ev: Event): Promise<void> {
    ev.preventDefault();
    this.error.set(null);
    if (this.mode() === 'register' && this.password().length < 10) {
      this.error.set('La password deve avere almeno 10 caratteri.');
      return;
    }
    this.busy.set(true);
    try {
      if (this.mode() === 'login') await this.auth.login(this.email(), this.password());
      else await this.auth.register(this.email(), this.password());
      this.toasts.show('success', this.mode() === 'login' ? 'Bentornato!' : 'Account creato.');
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(apiError(e, 'Qualcosa è andato storto: riprova.'));
    } finally {
      this.busy.set(false);
    }
  }
}
