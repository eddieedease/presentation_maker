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

export const TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const TRANSITION_SPEEDS = ['default', 'fast', 'slow'] as const;
export type TransitionSpeed = (typeof TRANSITION_SPEEDS)[number];

export const ELEMENT_TYPES = ['heading', 'text', 'list', 'quote', 'image', 'code', 'shape'] as const;
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
export type ShapeKind = 'rectangle' | 'ellipse' | 'line';
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
    color: '#ffffff',
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
        background: { type: 'gradient', value: 'linear-gradient(135deg, #1e1b4b, #0f172a)' },
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
