import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { config } from 'zod';

// la CSP vieta eval: senza questo zod prova new Function('') e la violazione finisce in console
config({ jitless: true });

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
