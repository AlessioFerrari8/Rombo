import { Component, Injector, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { desktopBridge } from './core/platform';
import { ThemeService } from './core/theme';
import { ToastHost } from './shared/toast-host/toast-host';

@Component({ selector: 'app-root', templateUrl: './app.html', imports: [RouterOutlet, ToastHost] })
export class App {
  // istanziato qui perche' applichi subito il tema
  protected readonly theme = inject(ThemeService);

  constructor() {
    void inject(Auth).init();
    // menu File e file aperti dal sistema, solo nel guscio desktop. Import pigro: serialize/zod
    // fuori dal bundle iniziale, e zod parte dopo il config({ jitless }) di main.ts (CSP senza eval)
    if (desktopBridge()) {
      const injector = inject(Injector);
      void import('./core/desktop-bridge').then((m) => injector.get(m.DesktopBridge).init());
    }
  }
}
