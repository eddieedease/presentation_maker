import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SlideElement } from '../core/models/deck.model';
import { ChartView } from './chart-view';
import { contentStyle, listItems, shapeStyle } from './deck-style';
import { IconPart, iconOrFallback } from './icons';
import { MathView } from './math-view';

/**
 * Renders the inner content of a single slide element. Shared by the editor
 * canvas and the reveal.js player so both stay pixel-identical.
 *
 * All text is bound as interpolated content, never innerHTML, so authored
 * content can never inject markup into a published deck.
 */
@Component({
  selector: 'app-element-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartView, MathView],
  templateUrl: './element-view.html',
})
export class ElementView {
  readonly element = input.required<SlideElement>();
  /** Charts pick their palette from the surface they sit on. */
  readonly dark = input(false);
  /**
   * The editor draws a still placeholder for video: a live iframe would swallow
   * the pointer events that dragging and selection depend on.
   */
  readonly interactive = input(false);

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly content = computed(() => contentStyle(this.element()));
  protected readonly shape = computed(() => shapeStyle(this.element()));
  protected readonly items = computed(() => listItems(this.element()));
  protected readonly icon = computed(() => iconOrFallback(this.element().icon));

  protected readonly tableRows = computed(() => {
    const table = this.element().table;
    const rows = table.rows;

    return {
      head: table.headerRow ? (rows[0] ?? []) : null,
      body: table.headerRow ? rows.slice(1) : rows,
    };
  });

  /**
   * Embed URL for the two providers we accept.
   *
   * Angular refuses a plain string in an iframe's resource-URL slot, and
   * rightly so. Trusting it here is safe because the URL is built entirely from
   * constants plus an id the normalizer has already constrained to that
   * provider's own character set — nothing user-authored reaches the URL.
   */
  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const element = this.element();
    if (element.videoId === '') {
      return null;
    }

    const url =
      element.videoProvider === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${element.videoId}`
        : element.videoProvider === 'vimeo'
          ? `https://player.vimeo.com/video/${element.videoId}`
          : null;

    return url === null ? null : this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected partKind(part: IconPart): string {
    return part.k;
  }
}
