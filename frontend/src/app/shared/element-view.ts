import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SlideElement } from '../core/models/deck.model';
import { PollResult, QuestionResult } from '../core/models/live.model';
import { ChartView } from './chart-view';
import { contentStyle, listItems, shapeStyle } from './deck-style';
import { IconPart, iconOrFallback } from './icons';
import { LiveDisplay } from './live-display';
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
  private readonly display = inject(LiveDisplay);

  /** True only on the presenter's live screen, where polls and questions fill in. */
  protected readonly liveOn = computed(() => this.interactive() && this.display.active());
  protected readonly closed = computed(() => this.liveOn() && this.display.closed().includes(this.element().id));

  protected readonly pollRows = computed(() => {
    const element = this.element();
    const result = this.liveOn() ? this.display.results()[element.id] : undefined;
    const counts = result?.kind === 'poll' ? (result as PollResult).counts : [];
    const voters = result?.kind === 'poll' ? (result as PollResult).voters : 0;

    // Blank options are dropped on save, so the counts line up with these indexes.
    const options = element.poll.options.filter((option) => option.trim() !== '');

    return {
      voters,
      rows: options.map((label, index) => {
        const count = counts[index] ?? 0;

        return { label, count, share: voters === 0 ? 0 : Math.round((count / voters) * 100) };
      }),
    };
  });

  protected readonly answers = computed(() => {
    const result = this.liveOn() ? this.display.results()[this.element().id] : undefined;

    return result?.kind === 'question'
      ? (result as QuestionResult).answers.filter((answer) => !answer.hidden)
      : [];
  });

  protected readonly showAnswers = computed(() => this.display.showAnswers());

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
