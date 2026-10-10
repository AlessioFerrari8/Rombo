import { ApplicationConfig, LOCALE_ID, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withXsrfConfiguration } from '@angular/common/http';
import localeIt from '@angular/common/locales/it';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { isDesktop } from './core/platform';

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'it' },
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() && !isDesktop, registrationStrategy: 'registerWhenStable:30000' }),
  ],
};
