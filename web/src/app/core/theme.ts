import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'quaderno' | 'lavagna';
const KEY = 'diagrammier.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.dataset['theme'] = t;
      try {
        localStorage.setItem(KEY, t);
      } catch {
        // storage non disponibile (navigazione privata): il tema vale per questa sessione
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'quaderno' ? 'lavagna' : 'quaderno'));
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'quaderno' || saved === 'lavagna') return saved;
    } catch {
      // ignora
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'lavagna' : 'quaderno';
  }
}
