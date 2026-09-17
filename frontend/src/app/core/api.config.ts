import { InjectionToken } from '@angular/core';

/** The app's base href, always with a trailing slash. */
function baseUrl(): string {
  const base = document.baseURI || '/';

  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Base URL of the PHP API, resolved against the app's base href so the same
 * build works at the web root and in a subdirectory (example.com/decks/).
 *
 * In development the Angular dev server proxies `/api` to the container on
 * :8080 (see proxy.conf.json).
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => new URL('api', baseUrl()).pathname,
});

/** Absolute, shareable URL of a published deck. */
export function publicDeckUrl(slug: string): string {
  return new URL(`p/${encodeURIComponent(slug)}`, baseUrl()).href;
}
