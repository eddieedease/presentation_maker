import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import Reveal, { RevealApi } from 'reveal.js/dist/reveal.esm.js';
import RevealHighlight from 'reveal.js/plugin/highlight/highlight.esm.js';
import RevealNotes from 'reveal.js/plugin/notes/notes.esm.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, Deck, Slide } from '../core/models/deck.model';
import { boxStyle, fragmentClass, rotationTransform } from './deck-style';
import { ElementView } from './element-view';

/** reveal.js stylesheets are loaded as global <link>s so they reach projected slides. */
function ensureStylesheet(id: string, href: string): void {
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

@Component({
  selector: 'app-reveal-deck',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ElementView],
  template: `
    <div class="reveal h-full w-full" #root>
      <div class="slides">
        @for (slide of deck().slides; track slide.id) {
          <section
            [attr.data-transition]="slide.transition || null"
            [attr.data-background-color]="backgroundColor(slide)"
            [attr.data-background-image]="backgroundImage(slide)"
            [attr.data-background-gradient]="backgroundGradient(slide)"
          >
            <div
              class="pm-canvas"
              [style.width.px]="canvasWidth"
              [style.height.px]="canvasHeight"
              style="position:relative;margin:0 auto"
            >
              @for (element of slide.elements; track element.id) {
                <div
                  [style]="box(element)"
                  [class]="fragment(element)"
                  [attr.data-fragment-index]="
                    element.animation.type === 'none' ? null : element.animation.order
                  "
                >
                  <!-- Rotation lives here, not on the fragment element above. -->
                  <div style="width:100%;height:100%" [style.transform]="rotate(element)">
                    <app-element-view [element]="element" />
                  </div>
                </div>
              }
            </div>
            @if (slide.notes) {
              <aside class="notes">{{ slide.notes }}</aside>
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `,
})
export class RevealDeck implements AfterViewInit {
  readonly deck = input.required<Deck>();
  /**
   * Embedded mode keeps reveal inside its container, but it also makes reveal
   * ignore the keyboard until the deck is clicked. Only use it for a deck that
   * genuinely shares the page with other content.
   */
  readonly embedded = input(false);
  /** Deep-link the current slide in the URL. Wanted on the publish site only. */
  readonly enableHash = input(false);

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly box = boxStyle;
  protected readonly fragment = fragmentClass;
  protected readonly rotate = rotationTransform;

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly destroyRef = inject(DestroyRef);
  private instance: RevealApi | null = null;
  private ready = false;

  constructor() {
    ensureStylesheet('reveal-core-css', 'reveal/reveal.css');
    ensureStylesheet('reveal-highlight-css', 'reveal/highlight/monokai.css');

    effect(() => {
      ensureStylesheet('reveal-theme-css', `reveal/theme/${this.deck().theme}.css`);
    });

    // Re-initialise when the deck document itself is swapped (preview reopened).
    effect(() => {
      const deck = this.deck();
      if (this.ready) {
        queueMicrotask(() => this.boot(deck));
      }
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  ngAfterViewInit(): void {
    this.ready = true;
    void this.boot(this.deck());
  }

  private async boot(deck: Deck): Promise<void> {
    this.teardown();

    const instance = new Reveal(this.root().nativeElement, {
      // A fixed authoring canvas; reveal scales it to whatever the viewport is.
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      margin: 0,
      center: false,
      embedded: this.embedded(),
      hash: this.enableHash(),
      respondToHashChanges: this.enableHash(),
      keyboard: true,
      touch: true,
      controls: deck.controls,
      progress: deck.progress,
      slideNumber: deck.slideNumber ? 'c/t' : false,
      loop: deck.loop,
      transition: deck.transition,
      transitionSpeed: deck.transitionSpeed,
      backgroundTransition: 'fade',
      plugins: [RevealHighlight, RevealNotes],
    });

    this.instance = instance;
    await instance.initialize();
  }

  private teardown(): void {
    try {
      this.instance?.destroy();
    } catch {
      // reveal throws if it was never fully initialised; nothing to clean up then.
    }
    this.instance = null;
  }

  protected backgroundColor(slide: Slide): string | null {
    return slide.background.type === 'color' && slide.background.value ? slide.background.value : null;
  }

  protected backgroundImage(slide: Slide): string | null {
    return slide.background.type === 'image' && slide.background.value ? slide.background.value : null;
  }

  protected backgroundGradient(slide: Slide): string | null {
    return slide.background.type === 'gradient' && slide.background.value ? slide.background.value : null;
  }
}
