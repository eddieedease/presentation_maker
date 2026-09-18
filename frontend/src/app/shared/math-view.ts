import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ensureStylesheet } from './reveal-assets';

/**
 * Typesets a LaTeX expression with KaTeX.
 *
 * KaTeX is imported lazily and its stylesheet is loaded on demand, so decks
 * without maths pay nothing for it. Both are served from our own origin rather
 * than reveal's default CDN, which keeps published decks self-contained.
 *
 * The rendered markup is trusted deliberately: the input is LaTeX rather than
 * HTML, KaTeX runs with `trust: false` so command families that can emit links
 * or foreign markup are refused, and its output relies on inline positioning
 * styles that Angular's sanitizer would strip, breaking every formula.
 */
@Component({
  selector: 'app-math-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rendered(); as html) {
      <div [innerHTML]="html" style="width: 100%"></div>
    } @else {
      <span style="opacity: 0.6">{{ latex() }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class MathView {
  readonly latex = input.required<string>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;

  protected readonly rendered = signal<SafeHtml | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));

    effect(() => {
      const source = this.latex();
      void this.typeset(source);
    });
  }

  private async typeset(source: string): Promise<void> {
    if (source.trim() === '') {
      this.rendered.set(null);
      return;
    }

    try {
      ensureStylesheet('katex-css', 'katex/katex.min.css');
      const katex = await import('katex');
      if (this.destroyed) {
        return;
      }

      const html = katex.default.renderToString(source, {
        throwOnError: false,
        displayMode: true,
        output: 'html',
        trust: false,
        strict: 'ignore',
      });

      this.rendered.set(this.sanitizer.bypassSecurityTrustHtml(html));
    } catch {
      // Fall back to showing the raw expression rather than an empty box.
      this.rendered.set(null);
    }
  }
}
