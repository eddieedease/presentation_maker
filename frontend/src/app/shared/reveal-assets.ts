import { RevealTheme } from '../core/models/deck.model';

/**
 * reveal.js stylesheets have to be global <link>s: they style slide markup that
 * Angular projects, which component-scoped styles would never reach.
 */
export function ensureStylesheet(id: string, href: string): void {
  let link = document.getElementById(id) as HTMLLinkElement | null;

  if (link === null) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
}

/**
 * Loads a deck theme.
 *
 * The editor loads this too, even though it renders its own canvas rather than
 * reveal's: the theme file declares the @font-face rules and the `--r-*` custom
 * properties on :root, which is how the canvas can preview the theme's fonts.
 * Its `.reveal` rules simply match nothing on the editor page.
 */
export function ensureRevealTheme(theme: RevealTheme): void {
  ensureStylesheet('reveal-theme-css', `reveal/theme/${theme}.css`);
}
