import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CANVAS_HEIGHT, CANVAS_WIDTH, RevealTheme, Slide, THEME_PALETTE } from '../../core/models/deck.model';
import { boxStyle } from '../../shared/deck-style';
import { ElementView } from '../../shared/element-view';

/**
 * A true-to-life miniature of a slide: the same renderer as the canvas,
 * scaled down with a CSS transform.
 */
@Component({
  selector: 'app-slide-thumbnail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ElementView],
  template: `
    <div class="relative aspect-video w-full overflow-hidden rounded-md" [style]="background()" [style.color]="palette().text">
      <div
        class="absolute top-0 left-0 origin-top-left"
        [style.width.px]="canvasWidth"
        [style.height.px]="canvasHeight"
        [style.transform]="'scale(' + scale() + ')'"
      >
        @for (element of slide().elements; track element.id) {
          <div [style]="box(element)">
            <app-element-view [element]="element" />
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
  `,
})
export class SlideThumbnail {
  readonly slide = input.required<Slide>();
  /** Rendered width in px; drives the scale factor. */
  readonly width = input(168);
  /** Deck theme, so the miniature matches what the deck will look like. */
  readonly theme = input<RevealTheme>('night');

  protected readonly palette = computed(() => THEME_PALETTE[this.theme()]);

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly box = boxStyle;

  protected readonly scale = computed(() => this.width() / CANVAS_WIDTH);

  protected readonly background = computed<Record<string, string>>(() => this.backgroundStyle());

  private backgroundStyle(): Record<string, string> {
    const { type, value } = this.slide().background;
    if (value === '') {
      return { background: this.palette().background };
    }
    if (type !== 'image') {
      return { background: value };
    }

    // Strip the characters that could break out of the url("…") literal.
    const safeUrl = value.replace(/["\\\n\r]/g, '');

    return {
      'background-image': `url("${safeUrl}")`,
      'background-size': 'cover',
      'background-position': 'center',
    };
  }
}
