import { DestroyRef, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ViewportSize {
  /** true da 1024 px in su: sotto si guarda soltanto. */
  readonly wide = signal(true);

  constructor() {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(min-width: 1024px)');
    this.wide.set(mq.matches);
    const on = (e: MediaQueryListEvent) => this.wide.set(e.matches);
    mq.addEventListener('change', on);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', on));
  }
}
