import { Animation, SlideElement } from '../core/models/deck.model';

/** Maps our animation names onto reveal.js fragment classes. */
const FRAGMENT_CLASS: Record<Animation, string> = {
  none: '',
  'fade-in': 'fragment',
  'fade-up': 'fragment fade-up',
  'fade-left': 'fragment fade-left',
  'fade-right': 'fragment fade-right',
  'zoom-in': 'fragment zoom-in',
  highlight: 'fragment highlight-blue',
};

export function fragmentClass(element: SlideElement): string {
  return FRAGMENT_CLASS[element.animation.type];
}

/** Absolute placement on the authoring canvas. Shared by the editor and the player. */
export function boxStyle(element: SlideElement): Record<string, string> {
  return {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    'z-index': String(element.zIndex),
  };
}

/**
 * Rotation, kept separate from boxStyle on purpose.
 *
 * reveal.js animates directional fragments (fade-left and friends) with
 * `transform: translate(...)` on the element carrying the `fragment` class. An
 * inline transform on that same element wins over the stylesheet and silently
 * cancels the movement, so the player applies rotation to an inner wrapper
 * instead and leaves the fragment element's transform alone.
 */
export function rotationTransform(element: SlideElement): string {
  return element.rotation === 0 ? 'none' : `rotate(${element.rotation}deg)`;
}

/** Visual styling of the element's content box. */
export function contentStyle(element: SlideElement): Record<string, string> {
  const style = element.style;
  const justify = { start: 'flex-start', center: 'center', end: 'flex-end' } as const;

  const base: Record<string, string> = {
    // Opacity lives on the content box, not the positioned wrapper: the wrapper
    // carries reveal.js fragment classes, and an inline opacity there would
    // override the stylesheet rule that keeps un-revealed fragments hidden.
    opacity: String(style.opacity),
    width: '100%',
    height: '100%',
    display: 'flex',
    'flex-direction': 'column',
    'justify-content': justify[style.verticalAlign],
    'box-sizing': 'border-box',
    // A shape paints itself; painting the box too would fill the whole element,
    // which is wrong for anything that is not a full-bleed rectangle.
    'background': element.type === 'shape' ? 'transparent' : style.background,
    'border-radius': `${style.borderRadius}px`,
    'padding': `${style.padding}px`,
    'overflow': 'hidden',
  };

  if (style.borderWidth > 0) {
    // A quote reads better with a single accent rule than a full box.
    base[element.type === 'quote' ? 'border-left' : 'border'] =
      `${style.borderWidth}px solid ${style.borderColor}`;
  }

  if (element.type === 'image' || element.type === 'shape') {
    return base;
  }

  return {
    ...base,
    // An empty colour is left off entirely so the value inherits from the
    // reveal.js theme (or, in the editor, from the canvas).
    ...(style.color === '' ? {} : { color: style.color }),
    'font-size': `${style.fontSize}px`,
    'font-weight': String(style.fontWeight),
    'font-style': style.italic ? 'italic' : 'normal',
    'text-decoration': style.underline ? 'underline' : 'none',
    'text-align': style.align,
    'line-height': String(style.lineHeight),
    'letter-spacing': `${style.letterSpacing}px`,
    // reveal.js themes publish their fonts as :root custom properties. Using
    // them here is what makes a theme switch visible: without this, headings
    // fall back to the body font and every theme looks alike.
    'font-family': style.fontFamily || `var(${element.type === 'heading' ? '--r-heading-font' : '--r-main-font'}, inherit)`,
    ...(element.type === 'heading' ? { 'text-transform': 'var(--r-heading-text-transform, none)' } : {}),
    'white-space': 'pre-wrap',
    'word-break': 'break-word',
  };
}

export function shapeStyle(element: SlideElement): Record<string, string> {
  if (element.shape === 'ellipse') {
    return { width: '100%', height: '100%', 'border-radius': '9999px', background: element.style.background };
  }
  if (element.shape === 'line') {
    return {
      width: '100%',
      height: `${Math.max(2, element.style.borderWidth || 4)}px`,
      background: element.style.background,
      'align-self': 'center',
    };
  }

  return { width: '100%', height: '100%', background: element.style.background };
}

/** Splits the textarea content of a list element into bullet lines. */
export function listItems(element: SlideElement): string[] {
  return element.text.split('\n').filter((line) => line.trim() !== '');
}
