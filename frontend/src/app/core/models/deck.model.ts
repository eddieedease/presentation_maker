/**
 * The deck document. This shape is mirrored by the PHP DeckNormalizer, which
 * re-validates everything server side — keep the two in sync.
 */

/** Slides are authored on a fixed canvas; reveal.js scales it to the viewport. */
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export const REVEAL_THEMES = [
  'night',
  'black',
  'white',
  'league',
  'beige',
  'serif',
  'simple',
  'solarized',
  'moon',
  'dracula',
  'sky',
  'blood',
] as const;
export type RevealTheme = (typeof REVEAL_THEMES)[number];

/**
 * Approximate background and text colour of each reveal.js theme.
 *
 * The editor canvas is our own rendering, not reveal's, so it cannot pick these
 * up from the theme stylesheet. This table lets the canvas preview the theme,
 * which is what makes switching themes visibly do something while editing.
 */
export const THEME_PALETTE: Record<RevealTheme, { background: string; text: string }> = {
  night: { background: '#111111', text: '#eeeeee' },
  black: { background: '#191919', text: '#ffffff' },
  white: { background: '#ffffff', text: '#222222' },
  league: { background: '#2b2b2b', text: '#eeeeee' },
  beige: { background: '#f7f3de', text: '#333333' },
  serif: { background: '#f0f1eb', text: '#000000' },
  simple: { background: '#ffffff', text: '#000000' },
  solarized: { background: '#fdf6e3', text: '#657b83' },
  moon: { background: '#002b36', text: '#93a1a1' },
  dracula: { background: '#282a36', text: '#f8f8f2' },
  sky: { background: '#f7fbfc', text: '#333333' },
  blood: { background: '#222222', text: '#eeeeee' },
};

export const TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const TRANSITION_SPEEDS = ['default', 'fast', 'slow'] as const;
export type TransitionSpeed = (typeof TRANSITION_SPEEDS)[number];

export const ELEMENT_TYPES = [
  'heading',
  'text',
  'list',
  'quote',
  'image',
  'video',
  'table',
  'chart',
  'icon',
  'code',
  'math',
  'shape',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const ANIMATIONS = [
  'none',
  'fade-in',
  'fade-up',
  'fade-left',
  'fade-right',
  'zoom-in',
  'highlight',
] as const;
export type Animation = (typeof ANIMATIONS)[number];

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'start' | 'center' | 'end';
export const SHAPE_KINDS = ['rectangle', 'ellipse', 'line', 'arrow'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const CHART_KINDS = ['bar', 'column', 'line', 'pie'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/** Video is embed-only: nothing is uploaded, so nothing has to be stored. */
export const VIDEO_PROVIDERS = ['youtube', 'vimeo'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export interface TableData {
  /** Render the first row as a header. */
  headerRow: boolean;
  rows: string[][];
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartData {
  kind: ChartKind;
  points: ChartPoint[];
  showValues: boolean;
  showAxis: boolean;
}
export type ObjectFit = 'cover' | 'contain' | 'fill';
export type BackgroundType = 'color' | 'gradient' | 'image';

export interface ElementStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  background: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  opacity: number;
  lineHeight: number;
  letterSpacing: number;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  objectFit: ObjectFit;
}

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  text: string;
  src: string;
  alt: string;
  language: string;
  shape: ShapeKind;
  /** Icon elements: a key into ICONS. */
  icon: string;
  /** Video elements: the provider and id parsed out of the pasted URL. */
  videoProvider: VideoProvider | '';
  videoId: string;
  table: TableData;
  chart: ChartData;
  style: ElementStyle;
  animation: { type: Animation; order: number };
}

export interface SlideBackground {
  type: BackgroundType;
  value: string;
}

export interface Slide {
  id: string;
  name: string;
  notes: string;
  /** Empty string means "inherit the deck transition". */
  transition: Transition | '';
  background: SlideBackground;
  elements: SlideElement[];
}

export interface Deck {
  version: number;
  theme: RevealTheme;
  transition: Transition;
  transitionSpeed: TransitionSpeed;
  controls: boolean;
  progress: boolean;
  slideNumber: boolean;
  loop: boolean;
  slides: Slide[];
}

/** True when a theme's background is dark, so charts can pick their dark steps. */
export function isDarkTheme(theme: RevealTheme): boolean {
  const hex = THEME_PALETTE[theme].background.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);

  // Rec. 709 relative luminance is enough to choose a palette side.
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) < 0.5;
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function defaultStyle(): ElementStyle {
  return {
    fontSize: 32,
    fontFamily: '',
    fontWeight: 400,
    italic: false,
    underline: false,
    // Empty means "whatever the deck theme says", so switching theme is visible.
    color: '',
    background: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    opacity: 1,
    lineHeight: 1.3,
    letterSpacing: 0,
    align: 'left',
    verticalAlign: 'start',
    objectFit: 'cover',
  };
}

/** Overrides accept a partial style, which is merged over the defaults. */
export type ElementOverrides = Omit<Partial<SlideElement>, 'style'> & { style?: Partial<ElementStyle> };

const ELEMENT_PRESETS: Record<ElementType, ElementOverrides> = {
  heading: {
    text: 'Your heading',
    width: 900,
    height: 110,
    style: { fontSize: 60, fontWeight: 700 },
  },
  text: {
    text: 'Add your supporting copy here.',
    width: 700,
    height: 120,
    style: { fontSize: 30 },
  },
  list: {
    text: 'First point\nSecond point\nThird point',
    width: 760,
    height: 260,
    style: { fontSize: 30, lineHeight: 1.7 },
  },
  quote: {
    text: 'A quote worth putting on a slide.',
    width: 780,
    height: 180,
    style: { fontSize: 36, italic: true, padding: 28, borderWidth: 4, borderColor: '#6366f1' },
  },
  image: {
    src: '',
    alt: 'Slide image',
    width: 520,
    height: 320,
  },
  code: {
    text: 'function greet(name) {\n  return `Hello ${name}`;\n}',
    language: 'javascript',
    width: 720,
    height: 260,
    style: { fontSize: 22, background: '#0f172a', borderRadius: 12, padding: 20, lineHeight: 1.5 },
  },
  shape: {
    shape: 'rectangle',
    width: 320,
    height: 200,
    style: { background: '#6366f1', borderRadius: 16 },
  },
  video: {
    width: 640,
    height: 360,
    style: { borderRadius: 12 },
  },
  table: {
    width: 760,
    height: 240,
    table: {
      headerRow: true,
      rows: [
        ['Quarter', 'Target', 'Actual'],
        ['Q1', '100', '112'],
        ['Q2', '120', '118'],
      ],
    },
    style: { fontSize: 24, borderWidth: 1, borderColor: '#94a3b8' },
  },
  chart: {
    width: 640,
    height: 360,
    chart: {
      kind: 'bar',
      points: [
        { label: 'Q1', value: 112 },
        { label: 'Q2', value: 118 },
        { label: 'Q3', value: 96 },
        { label: 'Q4', value: 134 },
      ],
      showValues: true,
      showAxis: true,
    },
    style: { fontSize: 18 },
  },
  icon: {
    icon: 'star',
    width: 140,
    height: 140,
    style: { color: '#6366f1' },
  },
  math: {
    text: 'e^{i\\pi} + 1 = 0',
    width: 460,
    height: 120,
    style: { fontSize: 44, align: 'center', verticalAlign: 'center' },
  },
};

export function createElement(type: ElementType, overrides: ElementOverrides = {}): SlideElement {
  const preset = ELEMENT_PRESETS[type];

  return {
    id: id('el'),
    type,
    x: 120,
    y: 120,
    width: 480,
    height: 140,
    rotation: 0,
    zIndex: 1,
    locked: false,
    text: '',
    src: '',
    alt: '',
    language: 'javascript',
    shape: 'rectangle',
    icon: 'star',
    videoProvider: '',
    videoId: '',
    table: { headerRow: true, rows: [['', '']] },
    chart: { kind: 'bar', points: [], showValues: true, showAxis: true },
    animation: { type: 'none', order: 0 },
    ...preset,
    ...overrides,
    style: { ...defaultStyle(), ...preset.style, ...overrides.style },
  };
}

export function createSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: id('slide'),
    name: '',
    notes: '',
    transition: '',
    background: { type: 'color', value: '' },
    elements: [],
    ...overrides,
  };
}

export function createDeck(title = 'Untitled presentation'): Deck {
  return {
    version: 1,
    theme: 'night',
    transition: 'slide',
    transitionSpeed: 'default',
    controls: true,
    progress: true,
    slideNumber: false,
    loop: false,
    slides: [
      createSlide({
        name: 'Title',
        elements: [
          createElement('heading', {
            text: title,
            x: 120,
            y: 260,
            width: 1040,
            height: 130,
            style: { fontSize: 76, fontWeight: 700, align: 'center' },
          }),
        ],
      }),
    ],
  };
}

/** Structural clone used by the editor's undo history and by slide duplication. */
export function cloneDeck(deck: Deck): Deck {
  return structuredClone(deck);
}

/** Re-ids a slide and its elements so a duplicate never collides with its source. */
export function reindexSlide(slide: Slide): Slide {
  return {
    ...structuredClone(slide),
    id: id('slide'),
    elements: slide.elements.map((element) => ({ ...structuredClone(element), id: id('el') })),
  };
}
