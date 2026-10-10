import { Injectable, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface Toast { id: number; kind: ToastKind; text: string }

@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly items = signal<Toast[]>([]);
  private next = 1;

  show(kind: ToastKind, text: string, ms = 5000): void {
    const id = this.next++;
    this.items.update((list) => [...list, { id, kind, text }].slice(-4));
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }
}
