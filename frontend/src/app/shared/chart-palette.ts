/**
 * Categorical palette for slide charts.
 *
 * Both columns are the same six hues stepped for their own surface, not an
 * automatic flip of one another. Validated with the data-viz validator on the
 * adjacent pairlist (bars, lines, pie sequence):
 *
 *   light  worst adjacent CVD ΔE 9.1 · normal-vision ΔE 19.6
 *   dark   worst adjacent CVD ΔE 8.4 · normal-vision ΔE 19.3
 *
 * On the light surface three of the six sit below 3:1 contrast, which obliges
 * relief — hence value labels are on by default and pie slices are always
 * labelled directly.
 */
export const CHART_SERIES_LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
] as const;

export const CHART_SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
] as const;

/** Slices past the palette fold into one neutral rather than inventing a hue. */
export const CHART_OVERFLOW_LIGHT = '#6b7280';
export const CHART_OVERFLOW_DARK = '#9ca3af';

export function seriesColour(index: number, dark: boolean): string {
  const ramp = dark ? CHART_SERIES_DARK : CHART_SERIES_LIGHT;

  return ramp[index] ?? (dark ? CHART_OVERFLOW_DARK : CHART_OVERFLOW_LIGHT);
}
