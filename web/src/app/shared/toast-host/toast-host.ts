import { Component, inject } from '@angular/core';
import { Toasts } from '../../core/toasts';

@Component({ selector: 'app-toast-host', templateUrl: './toast-host.html' })
export class ToastHost {
  protected readonly toasts = inject(Toasts);
}
