import { Routes } from '@angular/router';
import { isDesktop } from './core/platform';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'I miei diagrammi — Rombo',
  },
  {
    path: 'd/:id',
    loadComponent: () => import('./pages/editor-page/editor-page').then((m) => m.EditorPage),
    title: 'Rombo',
  },
  // il desktop non ha account ne' link condivisi
  ...(isDesktop ? [] : [
  { path: 'accedi', loadComponent: () => import('./pages/login/login').then((m) => m.Login), title: 'Accedi — Rombo' },
  { path: 's/:token', loadComponent: () => import('./pages/shared-page/shared-page').then((m) => m.SharedPage), title: 'Diagramma condiviso — Rombo' },
  ]),
  { path: '**', redirectTo: '' },
];
