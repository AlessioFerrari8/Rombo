import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { ThemeService } from './core/theme';
import { ToastHost } from './shared/toast-host/toast-host';

@Component({ selector: 'app-root', templateUrl: './app.html', imports: [RouterOutlet, ToastHost] })
export class App {
  // istanziato qui perche' applichi subito il tema
  protected readonly theme = inject(ThemeService);

  constructor() {
    void inject(Auth).init();
  }
}
