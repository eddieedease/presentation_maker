import { Slide, createElement, createSlide } from './deck.model';

/**
 * Starting points for a new slide.
 *
 * Layouts exist to remove the blank canvas, which is the slowest part of
 * building a deck. Elements are placed on the 1280x720 authoring grid with an
 * 80px side margin so slides line up with each other without fiddling.
 *
 * Nothing here sets a build animation: a layout should be fully visible the
 * moment it appears, and elements added afterwards pick up the staged reveal.
 */
export interface SlideLayout {
  id: string;
  name: string;
  description: string;
  build: () => Slide;
}

const MARGIN = 80;
const CONTENT_WIDTH = 1280 - MARGIN * 2;

export const SLIDE_LAYOUTS: SlideLayout[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from nothing',
    build: () => createSlide({ name: 'Slide' }),
  },
  {
    id: 'title',
    name: 'Title',
    description: 'Deck or chapter opener',
    build: () =>
      createSlide({
        name: 'Title',
        elements: [
          createElement('heading', {
            text: 'Presentation title',
            x: MARGIN,
            y: 250,
            width: CONTENT_WIDTH,
            height: 130,
            style: { fontSize: 76, fontWeight: 700, align: 'center' },
          }),
          createElement('text', {
            text: 'Subtitle or presenter name',
            x: MARGIN,
            y: 392,
            width: CONTENT_WIDTH,
            height: 60,
            style: { fontSize: 30, align: 'center', opacity: 0.8 },
          }),
        ],
      }),
  },
  {
    id: 'title-content',
    name: 'Title and bullets',
    description: 'The everyday slide',
    build: () =>
      createSlide({
        name: 'Slide',
        elements: [
          createElement('heading', {
            text: 'Slide title',
            x: MARGIN,
            y: 70,
            width: CONTENT_WIDTH,
            height: 90,
            style: { fontSize: 54, fontWeight: 700 },
          }),
          createElement('list', {
            text: 'First point\nSecond point\nThird point',
            x: MARGIN,
            y: 200,
            width: CONTENT_WIDTH,
            height: 420,
            style: { fontSize: 32, lineHeight: 1.7 },
          }),
        ],
      }),
  },
  {
    id: 'two-columns',
    name: 'Two columns',
    description: 'Compare side by side',
    build: () =>
      createSlide({
        name: 'Comparison',
        elements: [
          createElement('heading', {
            text: 'Slide title',
            x: MARGIN,
            y: 70,
            width: CONTENT_WIDTH,
            height: 90,
            style: { fontSize: 54, fontWeight: 700 },
          }),
          createElement('text', {
            text: 'Left column',
            x: MARGIN,
            y: 200,
            width: 520,
            height: 400,
            style: { fontSize: 28, lineHeight: 1.6 },
          }),
          createElement('text', {
            text: 'Right column',
            x: 680,
            y: 200,
            width: 520,
            height: 400,
            style: { fontSize: 28, lineHeight: 1.6 },
          }),
        ],
      }),
  },
  {
    id: 'image-text',
    name: 'Image and text',
    description: 'Picture on the left',
    build: () =>
      createSlide({
        name: 'Image',
        elements: [
          createElement('image', { x: MARGIN, y: 140, width: 540, height: 440 }),
          createElement('heading', {
            text: 'Slide title',
            x: 680,
            y: 160,
            width: 520,
            height: 90,
            style: { fontSize: 46, fontWeight: 700 },
          }),
          createElement('text', {
            text: 'Supporting copy that explains the image.',
            x: 680,
            y: 272,
            width: 520,
            height: 300,
            style: { fontSize: 28, lineHeight: 1.6 },
          }),
        ],
      }),
  },
  {
    id: 'chart-takeaway',
    name: 'Chart and takeaway',
    description: 'Data with the point beside it',
    build: () =>
      createSlide({
        name: 'Chart',
        elements: [
          createElement('heading', {
            text: 'What the numbers say',
            x: MARGIN,
            y: 70,
            width: CONTENT_WIDTH,
            height: 80,
            style: { fontSize: 48, fontWeight: 700 },
          }),
          createElement('chart', { x: MARGIN, y: 180, width: 620, height: 440, style: { fontSize: 20 } }),
          createElement('text', {
            text: 'The takeaway in one or two sentences.',
            x: 740,
            y: 220,
            width: 460,
            height: 340,
            style: { fontSize: 30, lineHeight: 1.6 },
          }),
        ],
      }),
  },
  {
    id: 'table',
    name: 'Table',
    description: 'Title with a data table',
    build: () =>
      createSlide({
        name: 'Table',
        elements: [
          createElement('heading', {
            text: 'Slide title',
            x: MARGIN,
            y: 70,
            width: CONTENT_WIDTH,
            height: 80,
            style: { fontSize: 48, fontWeight: 700 },
          }),
          createElement('table', {
            x: MARGIN,
            y: 190,
            width: CONTENT_WIDTH,
            height: 420,
            style: { fontSize: 26, borderWidth: 1, borderColor: '#94a3b8' },
          }),
        ],
      }),
  },
  {
    id: 'section',
    name: 'Section break',
    description: 'Divider between parts',
    build: () =>
      createSlide({
        name: 'Section',
        elements: [
          createElement('shape', {
            shape: 'rectangle',
            x: MARGIN,
            y: 330,
            width: 160,
            height: 8,
            style: { background: '#6366f1', borderRadius: 4 },
          }),
          createElement('heading', {
            text: 'Section name',
            x: MARGIN,
            y: 374,
            width: CONTENT_WIDTH,
            height: 120,
            style: { fontSize: 68, fontWeight: 700 },
          }),
        ],
      }),
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'A line worth dwelling on',
    build: () =>
      createSlide({
        name: 'Quote',
        elements: [
          createElement('quote', {
            text: 'A quote worth putting on a slide.',
            x: 160,
            y: 230,
            width: 960,
            height: 220,
            style: { fontSize: 44, italic: true, padding: 28, borderWidth: 4, borderColor: '#6366f1' },
          }),
          createElement('text', {
            text: '— Attribution',
            x: 160,
            y: 480,
            width: 960,
            height: 50,
            style: { fontSize: 26, align: 'right', opacity: 0.75 },
          }),
        ],
      }),
  },
];
