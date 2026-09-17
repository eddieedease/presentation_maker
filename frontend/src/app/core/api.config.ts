import { InjectionToken } from '@angular/core';

/**
 * Base URL of the PHP API. In development the Angular dev server proxies
 * `/api` to the container on :8080 (see proxy.conf.json).
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
