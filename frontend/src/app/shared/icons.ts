/**
 * A small built-in icon set.
 *
 * Icons are described as typed primitives rather than SVG source strings, so
 * the renderer can build them with ordinary Angular template bindings. Nothing
 * here goes through innerHTML, which means no sanitizer bypass and no way for a
 * deck to smuggle markup in through an icon name.
 *
 * Geometry is drawn on a 24x24 grid in the stroked style of Feather icons.
 */
export type IconPart =
  | { k: 'circle'; cx: number; cy: number; r: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; rx: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'polyline'; points: string }
  | { k: 'polygon'; points: string }
  | { k: 'path'; d: string };

export interface IconDefinition {
  label: string;
  /** Filled shapes read better for a few symbols; most are stroked. */
  filled?: boolean;
  parts: IconPart[];
}

export const ICONS: Record<string, IconDefinition> = {
  check: { label: 'Check', parts: [{ k: 'polyline', points: '20 6 9 17 4 12' }] },
  'check-circle': {
    label: 'Check in circle',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 9 },
      { k: 'polyline', points: '16.5 9 10.75 15 7.5 12' },
    ],
  },
  close: {
    label: 'Cross',
    parts: [
      { k: 'line', x1: 18, y1: 6, x2: 6, y2: 18 },
      { k: 'line', x1: 6, y1: 6, x2: 18, y2: 18 },
    ],
  },
  plus: {
    label: 'Plus',
    parts: [
      { k: 'line', x1: 12, y1: 5, x2: 12, y2: 19 },
      { k: 'line', x1: 5, y1: 12, x2: 19, y2: 12 },
    ],
  },
  minus: { label: 'Minus', parts: [{ k: 'line', x1: 5, y1: 12, x2: 19, y2: 12 }] },
  'arrow-right': {
    label: 'Arrow right',
    parts: [
      { k: 'line', x1: 4, y1: 12, x2: 20, y2: 12 },
      { k: 'polyline', points: '14 6 20 12 14 18' },
    ],
  },
  'arrow-left': {
    label: 'Arrow left',
    parts: [
      { k: 'line', x1: 20, y1: 12, x2: 4, y2: 12 },
      { k: 'polyline', points: '10 6 4 12 10 18' },
    ],
  },
  'arrow-up': {
    label: 'Arrow up',
    parts: [
      { k: 'line', x1: 12, y1: 20, x2: 12, y2: 4 },
      { k: 'polyline', points: '6 10 12 4 18 10' },
    ],
  },
  'arrow-down': {
    label: 'Arrow down',
    parts: [
      { k: 'line', x1: 12, y1: 4, x2: 12, y2: 20 },
      { k: 'polyline', points: '6 14 12 20 18 14' },
    ],
  },
  'trending-up': {
    label: 'Trending up',
    parts: [
      { k: 'polyline', points: '3 17 9 11 13 15 21 7' },
      { k: 'polyline', points: '15 7 21 7 21 13' },
    ],
  },
  'trending-down': {
    label: 'Trending down',
    parts: [
      { k: 'polyline', points: '3 7 9 13 13 9 21 17' },
      { k: 'polyline', points: '15 17 21 17 21 11' },
    ],
  },
  star: {
    label: 'Star',
    parts: [{ k: 'polygon', points: '12 2.6 15.1 8.9 22 9.9 17 14.8 18.2 21.7 12 18.4 5.8 21.7 7 14.8 2 9.9 8.9 8.9' }],
  },
  heart: {
    label: 'Heart',
    parts: [{ k: 'path', d: 'M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 22.4l8.8-8.7a5 5 0 0 0 0-7.1z' }],
  },
  circle: { label: 'Circle', parts: [{ k: 'circle', cx: 12, cy: 12, r: 9 }] },
  square: { label: 'Square', parts: [{ k: 'rect', x: 4, y: 4, w: 16, h: 16, rx: 2 }] },
  triangle: { label: 'Triangle', parts: [{ k: 'polygon', points: '12 3.5 22 20 2 20' }] },
  alert: {
    label: 'Warning',
    parts: [
      { k: 'polygon', points: '12 3.5 22 20 2 20' },
      { k: 'line', x1: 12, y1: 10, x2: 12, y2: 14.5 },
      { k: 'line', x1: 12, y1: 17, x2: 12, y2: 17.2 },
    ],
  },
  info: {
    label: 'Information',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 9 },
      { k: 'line', x1: 12, y1: 11, x2: 12, y2: 16.5 },
      { k: 'line', x1: 12, y1: 7.6, x2: 12, y2: 7.8 },
    ],
  },
  question: {
    label: 'Question',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 9 },
      { k: 'path', d: 'M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5v.5' },
      { k: 'line', x1: 12, y1: 16.6, x2: 12, y2: 16.8 },
    ],
  },
  lightbulb: {
    label: 'Idea',
    parts: [
      { k: 'path', d: 'M9 16a6 6 0 1 1 6 0v1.5H9V16z' },
      { k: 'line', x1: 10, y1: 20.5, x2: 14, y2: 20.5 },
    ],
  },
  target: {
    label: 'Target',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 9 },
      { k: 'circle', cx: 12, cy: 12, r: 5 },
      { k: 'circle', cx: 12, cy: 12, r: 1.4 },
    ],
  },
  flag: {
    label: 'Flag',
    parts: [
      { k: 'path', d: 'M5 21V4h9l-1.2 3H19l-1.5 4H12l1 4H5' },
      { k: 'line', x1: 5, y1: 4, x2: 5, y2: 21 },
    ],
  },
  clock: {
    label: 'Clock',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 9 },
      { k: 'polyline', points: '12 7 12 12 15.5 14' },
    ],
  },
  calendar: {
    label: 'Calendar',
    parts: [
      { k: 'rect', x: 3.5, y: 5, w: 17, h: 16, rx: 2 },
      { k: 'line', x1: 3.5, y1: 10, x2: 20.5, y2: 10 },
      { k: 'line', x1: 8, y1: 3, x2: 8, y2: 7 },
      { k: 'line', x1: 16, y1: 3, x2: 16, y2: 7 },
    ],
  },
  user: {
    label: 'Person',
    parts: [
      { k: 'circle', cx: 12, cy: 8, r: 3.8 },
      { k: 'path', d: 'M4.5 20.5a7.5 7.5 0 0 1 15 0' },
    ],
  },
  users: {
    label: 'People',
    parts: [
      { k: 'circle', cx: 9, cy: 8, r: 3.4 },
      { k: 'path', d: 'M2.5 20.5a6.5 6.5 0 0 1 13 0' },
      { k: 'path', d: 'M16 5.2a3.4 3.4 0 0 1 0 5.6' },
      { k: 'path', d: 'M17.5 14.6a6.5 6.5 0 0 1 4 5.9' },
    ],
  },
  mail: {
    label: 'Email',
    parts: [
      { k: 'rect', x: 3, y: 5.5, w: 18, h: 13, rx: 2 },
      { k: 'polyline', points: '3.5 7 12 13 20.5 7' },
    ],
  },
  globe: {
    label: 'Globe',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 9 },
      { k: 'line', x1: 3, y1: 12, x2: 21, y2: 12 },
      { k: 'path', d: 'M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z' },
    ],
  },
  lock: {
    label: 'Lock',
    parts: [
      { k: 'rect', x: 5, y: 10.5, w: 14, h: 10, rx: 2 },
      { k: 'path', d: 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3' },
    ],
  },
  search: {
    label: 'Search',
    parts: [
      { k: 'circle', cx: 11, cy: 11, r: 6.5 },
      { k: 'line', x1: 15.8, y1: 15.8, x2: 20.5, y2: 20.5 },
    ],
  },
  settings: {
    label: 'Settings',
    parts: [
      { k: 'circle', cx: 12, cy: 12, r: 3 },
      { k: 'circle', cx: 12, cy: 12, r: 8.5 },
      { k: 'line', x1: 12, y1: 3.5, x2: 12, y2: 6.5 },
      { k: 'line', x1: 12, y1: 17.5, x2: 12, y2: 20.5 },
    ],
  },
  chart: {
    label: 'Bar chart',
    parts: [
      { k: 'line', x1: 4, y1: 20, x2: 20, y2: 20 },
      { k: 'line', x1: 7.5, y1: 20, x2: 7.5, y2: 12 },
      { k: 'line', x1: 12, y1: 20, x2: 12, y2: 6.5 },
      { k: 'line', x1: 16.5, y1: 20, x2: 16.5, y2: 15 },
    ],
  },
  cloud: { label: 'Cloud', parts: [{ k: 'path', d: 'M7 19a4.5 4.5 0 0 1 .6-9A6 6 0 0 1 19 11.4a3.8 3.8 0 0 1-1 7.6H7z' }] },
  database: {
    label: 'Database',
    parts: [
      { k: 'path', d: 'M4.5 6c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3z' },
      { k: 'path', d: 'M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6' },
      { k: 'path', d: 'M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3' },
    ],
  },
  code: {
    label: 'Code',
    parts: [
      { k: 'polyline', points: '8.5 7.5 3.5 12 8.5 16.5' },
      { k: 'polyline', points: '15.5 7.5 20.5 12 15.5 16.5' },
    ],
  },
  link: {
    label: 'Link',
    parts: [
      { k: 'path', d: 'M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3' },
      { k: 'path', d: 'M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3' },
    ],
  },
  eye: {
    label: 'Eye',
    parts: [
      { k: 'path', d: 'M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z' },
      { k: 'circle', cx: 12, cy: 12, r: 2.8 },
    ],
  },
  zap: { label: 'Lightning', parts: [{ k: 'polygon', points: '13.5 2 4 13.5 11 13.5 10.5 22 20 10.5 13 10.5' }] },
  shield: { label: 'Shield', parts: [{ k: 'path', d: 'M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6l8-3.5z' }] },
  folder: { label: 'Folder', parts: [{ k: 'path', d: 'M3.5 19.5v-14h6l2 2.5h9v11.5z' }] },
  home: {
    label: 'Home',
    parts: [
      { k: 'polyline', points: '3.5 11 12 3.5 20.5 11' },
      { k: 'path', d: 'M6 9.8V20.5h12V9.8' },
    ],
  },
  'map-pin': {
    label: 'Location',
    parts: [
      { k: 'path', d: 'M12 21.5s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z' },
      { k: 'circle', cx: 12, cy: 10.2, r: 2.6 },
    ],
  },
  play: { label: 'Play', parts: [{ k: 'polygon', points: '7 4.5 20 12 7 19.5' }] },
  award: {
    label: 'Award',
    parts: [
      { k: 'circle', cx: 12, cy: 9, r: 5.5 },
      { k: 'polyline', points: '8.5 13.7 7.5 21.5 12 19 16.5 21.5 15.5 13.7' },
    ],
  },
  briefcase: {
    label: 'Briefcase',
    parts: [
      { k: 'rect', x: 3, y: 7.5, w: 18, h: 12, rx: 2 },
      { k: 'path', d: 'M9 7.5V5.5h6v2' },
      { k: 'line', x1: 3, y1: 13, x2: 21, y2: 13 },
    ],
  },
};

export const ICON_KEYS = Object.keys(ICONS);

export function iconOrFallback(name: string): IconDefinition {
  return ICONS[name] ?? ICONS['star']!;
}
