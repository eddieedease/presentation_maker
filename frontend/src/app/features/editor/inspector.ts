import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ANIMATIONS,
  Animation,
  CHART_KINDS,
  ChartKind,
  ChartPoint,
  SHAPE_KINDS,
  BackgroundType,
  ElementStyle,
  ObjectFit,
  REVEAL_THEMES,
  RevealTheme,
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
import { ICONS, ICON_KEYS } from '../../shared/icons';
import { parseVideoUrl } from '../../shared/video-embed';
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
  protected readonly shapes = SHAPE_KINDS;
  protected readonly chartKinds = CHART_KINDS;
  protected readonly iconKeys = ICON_KEYS;
  protected readonly icons = ICONS;
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
    return (
      type !== undefined &&
      !['image', 'video', 'shape', 'icon', 'chart', 'math'].includes(type)
    );
  });

  protected readonly videoError = signal<string | null>(null);

  // ---- video -------------------------------------------------------------

  protected applyVideoUrl(value: string): void {
    if (value.trim() === '') {
      this.setElement({ videoProvider: '', videoId: '' }, true);
      this.videoError.set(null);
      return;
    }

    const parsed = parseVideoUrl(value);
    if (parsed === null) {
      this.videoError.set('Only YouTube and Vimeo links are supported.');
      return;
    }

    this.videoError.set(null);
    this.setElement({ videoProvider: parsed.provider, videoId: parsed.id }, true);
  }

  // ---- table -------------------------------------------------------------

  private mutateTable(mutate: (rows: string[][]) => string[][]): void {
    const element = this.element();
    if (element === null) {
      return;
    }

    this.setElement({ table: { ...element.table, rows: mutate(structuredClone(element.table.rows)) } }, true);
  }

  protected setCell(rowIndex: number, cellIndex: number, value: string): void {
    const element = this.element();
    if (element === null) {
      return;
    }

    const rows = structuredClone(element.table.rows);
    const row = rows[rowIndex];
    if (row !== undefined) {
      row[cellIndex] = value;
    }

    this.setElement({ table: { ...element.table, rows } }, false);
  }

  protected addRow(): void {
    this.mutateTable((rows) => [...rows, new Array<string>(rows[0]?.length ?? 2).fill('')]);
  }

  protected removeRow(index: number): void {
    this.mutateTable((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  }

  protected addColumn(): void {
    this.mutateTable((rows) => rows.map((row) => [...row, '']));
  }

  protected removeColumn(): void {
    this.mutateTable((rows) => (rows[0]?.length ?? 0) <= 1 ? rows : rows.map((row) => row.slice(0, -1)));
  }

  protected toggleHeaderRow(headerRow: boolean): void {
    const element = this.element();
    if (element !== null) {
      this.setElement({ table: { ...element.table, headerRow } }, true);
    }
  }

  // ---- chart -------------------------------------------------------------

  private mutateChart(patch: Partial<{ kind: ChartKind; points: ChartPoint[]; showValues: boolean; showAxis: boolean }>, record = true): void {
    const element = this.element();
    if (element !== null) {
      this.setElement({ chart: { ...element.chart, ...patch } }, record);
    }
  }

  protected setChartKind(kind: string): void {
    this.mutateChart({ kind: kind as ChartKind });
  }

  protected setChartFlag(key: 'showValues' | 'showAxis', value: boolean): void {
    this.mutateChart({ [key]: value });
  }

  protected setPoint(index: number, patch: Partial<ChartPoint>): void {
    const element = this.element();
    if (element === null) {
      return;
    }

    const points = element.chart.points.map((point, i) => (i === index ? { ...point, ...patch } : point));
    this.mutateChart({ points }, false);
  }

  protected addPoint(): void {
    const element = this.element();
    if (element !== null) {
      this.mutateChart({ points: [...element.chart.points, { label: '', value: 0 }] });
    }
  }

  protected removePoint(index: number): void {
    const element = this.element();
    if (element !== null) {
      this.mutateChart({ points: element.chart.points.filter((_, i) => i !== index) });
    }
  }

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
