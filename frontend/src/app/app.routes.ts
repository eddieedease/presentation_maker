import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'Presentation Maker — build and publish decks',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'login',
    title: 'Sign in — Presentation Maker',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'auth/callback',
    title: 'Signing you in…',
    loadComponent: () => import('./features/auth/oauth-callback').then((m) => m.OauthCallback),
  },
  {
    path: 'verify',
    title: 'Confirming your email…',
    loadComponent: () => import('./features/auth/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'preview/:id',
    title: 'Preview — Presentation Maker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/preview/preview').then((m) => m.Preview),
  },
  {
    path: 'admin',
    title: 'Accounts — Presentation Maker',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  {
    path: 'workspace',
    title: 'Workspace — Presentation Maker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/workspace/workspace').then((m) => m.Workspace),
  },
  {
    path: 'editor/:id',
    title: 'Editor — Presentation Maker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/editor/editor').then((m) => m.Editor),
  },
  {
    path: 'p/:slug',
    loadComponent: () => import('./features/present/present').then((m) => m.Present),
  },
  { path: '**', redirectTo: '' },
];
