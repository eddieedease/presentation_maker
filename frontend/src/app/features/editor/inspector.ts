import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ANIMATIONS,
  Animation,
  BackgroundType,
  ElementStyle,
  ObjectFit,
  REVEAL_THEMES,
  RevealTheme,
  ShapeKind,
  SlideElement,
  TRANSITIONS,
  TRANSITION_SPEEDS,
  THEME_PALETTE,
  TextAlign,
  Transition,
  TransitionSpeed,
  VerticalAlign,
} from '../../core/models/deck.model';
import { StoredImage } from '../../core/models/image.model';
import { EditorStore } from './editor-store';
import { ImagePicker } from './image-picker';

type Tab = 'element' | 'slide' | 'deck';

const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #1e1b4b, #0f172a)',
  'linear-gradient(135deg, #0f766e, #082f49)',
  'linear-gradient(135deg, #7c2d12, #1c1917)',
  'linear-gradient(135deg, #4c1d95, #831843)',
];

@Component({
  selector: 'app-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImagePicker],
  templateUrl: './inspector.html',
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class Inspector {
  protected readonly store = inject(EditorStore);

  protected readonly themes = REVEAL_THEMES;
  protected readonly transitions = TRANSITIONS;
  protected readonly transitionSpeeds = TRANSITION_SPEEDS;
  protected readonly animations = ANIMATIONS;
  protected readonly gradients = GRADIENT_PRESETS;
  protected readonly alignments: TextAlign[] = ['left', 'center', 'right'];
  protected readonly verticalAlignments: VerticalAlign[] = ['start', 'center', 'end'];
  protected readonly shapes: ShapeKind[] = ['rectangle', 'ellipse', 'line'];
  protected readonly fits: ObjectFit[] = ['cover', 'contain', 'fill'];
  protected readonly fonts = ['', 'Georgia, serif', 'ui-monospace, monospace', 'Impact, sans-serif'];
  protected readonly languages = ['javascript', 'typescript', 'python', 'php', 'sql', 'bash', 'json', 'html', 'css'];

  protected readonly tabs: Tab[] = ['element', 'slide', 'deck'];
  protected readonly tab = signal<Tab>('element');
  protected readonly pickerOpen = signal(false);

  protected readonly element = this.store.selectedElement;
  protected readonly slide = this.store.currentSlide;
  protected readonly deck = this.store.deck;

  /** The colour an "inherit" element will actually render in. */
  protected readonly themeTextColour = computed(() => {
    const theme = this.deck()?.theme;
    return theme === undefined ? THEME_PALETTE.night.text : THEME_PALETTE[theme].text;
  });

  protected readonly isTextual = computed(() => {
    const type = this.element()?.type;
    return type !== undefined && type !== 'image' && type !== 'shape';
  });

  // ---- input plumbing ----------------------------------------------------

  /** Snapshots history once, at the start of a drag or typing session. */
  protected beginEdit(): void {
    this.store.beginInteraction();
  }

  protected setElement(patch: Partial<SlideElement>, record = false): void {
    const id = this.element()?.id;
    if (id !== undefined) {
      this.store.updateElement(id, patch, record);
    }
  }

  protected setStyle(patch: Partial<ElementStyle>, record = false): void {
    const id = this.element()?.id;
    if (id !== undefined) {
      this.store.updateElementStyle(id, patch, record);
    }
  }

  /** Applies a chosen image and sizes the box to its aspect ratio. */
  protected onImagePicked(image: StoredImage): void {
    const element = this.element();
    this.pickerOpen.set(false);

    if (element === null) {
      return;
    }

    const ratio = image.height / image.width;
    this.setElement(
      { src: image.url, alt: image.originalName, height: Math.round(element.width * ratio) },
      true,
    );
  }

  protected setAnimation(type: Animation): void {
    const element = this.element();
    if (element !== undefined && element !== null) {
      this.setElement({ animation: { ...element.animation, type } }, true);
    }
  }

  protected setAnimationOrder(order: number): void {
    const element = this.element();
    if (element !== undefined && element !== null) {
      this.setElement({ animation: { ...element.animation, order } }, true);
    }
  }

  protected setBackground(patch: { type?: BackgroundType; value?: string }, record = true): void {
    const slide = this.slide();
    if (slide === null) {
      return;
    }

    const background = { ...slide.background, ...patch };
    record ? this.store.updateSlide({ background }) : this.store.apply((draft) => {
      const target = draft.slides[this.store.slideIndex()];
      if (target !== undefined) {
        target.background = background;
      }
    });
  }

  protected num(value: string, fallback = 0): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  protected asTheme(value: string): RevealTheme {
    return value as RevealTheme;
  }

  protected asTransition(value: string): Transition {
    return value as Transition;
  }

  protected asSlideTransition(value: string): Transition | '' {
    return value as Transition | '';
  }

  protected asSpeed(value: string): TransitionSpeed {
    return value as TransitionSpeed;
  }

  protected asAnimation(value: string): Animation {
    return value as Animation;
  }
}
