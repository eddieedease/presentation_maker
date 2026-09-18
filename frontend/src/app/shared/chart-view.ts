import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartData, ChartPoint } from '../core/models/deck.model';
import { seriesColour } from './chart-palette';

interface BarMark {
  key: string;
  /** Path rather than a rect: only the data end carries the 4px radius. */
  d: string;
  label: string;
  value: string;
  colour: string;
  x: number;
  y: number;
  w: number;
  h: number;
  labelX: number;
  labelY: number;
  valueX: number;
  valueY: number;
  anchor: 'start' | 'middle' | 'end';
}

interface LineMarker {
  key: string;
  cx: number;
  cy: number;
  label: string;
  value: string;
}

interface LinePlot {
  path: string;
  markers: LineMarker[];
  labelY: number;
}

interface PieMark {
  key: string;
  d: string;
  colour: string;
  label: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * A bar whose data end is rounded and whose baseline end stays square, so the
 * mark reads as anchored to the axis rather than floating above it.
 */
function barPath(x: number, y: number, w: number, h: number, end: 'top' | 'right'): string {
  const r = Math.min(4, w / 2, h / 2);

  if (end === 'top') {
    return `M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h} Z`;
  }

  return `M${x} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} L${x} ${y + h} Z`;
}

const PAD = 14;
const LABEL_GAP = 8;
/** A 2px gap in the surface colour separates adjacent fills. */
const MARK_GAP = 2;

/**
 * Renders a slide chart as plain SVG — no charting library, so a published deck
 * stays self-contained and needs no runtime JS.
 *
 * Deliberately not interactive. The data-viz guidance asks for a hover layer on
 * HTML charts, but this one is projected on a slide where reveal.js owns the
 * pointer, so identity comes from direct labels instead.
 */
@Component({
  selector: 'app-chart-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chart-view.html',
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class ChartView {
  readonly chart = input.required<ChartData>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly fontSize = input(18);
  readonly dark = input(false);

  protected readonly points = computed<ChartPoint[]>(() =>
    this.chart().points.filter((point) => Number.isFinite(point.value)),
  );

  protected readonly kind = computed(() => this.chart().kind);
  protected readonly showValues = computed(() => this.chart().showValues);
  protected readonly showAxis = computed(() => this.chart().showAxis);

  /** Single-measure charts use one hue; pie is the only categorical form here. */
  protected readonly isPie = computed(() => this.kind() === 'pie');

  protected readonly bars = computed<BarMark[]>(() => {
    const points = this.points();
    if (points.length === 0 || this.isPie() || this.kind() === 'line') {
      return [];
    }

    const horizontal = this.kind() === 'bar';
    const font = this.fontSize();
    const maxValue = Math.max(...points.map((p) => Math.abs(p.value)), 1);
    const colour = seriesColour(0, this.dark());

    if (horizontal) {
      const labelWidth = Math.min(this.width() * 0.32, this.longestLabel() * font * 0.58 + LABEL_GAP);
      const valueWidth = this.showValues() ? font * 3 : 0;
      const plotLeft = PAD + labelWidth;
      const plotWidth = Math.max(10, this.width() - plotLeft - PAD - valueWidth);
      const band = (this.height() - PAD * 2) / points.length;
      const thickness = Math.max(4, band - MARK_GAP * 2);

      return points.map((point, index) => {
        const w = Math.max(2, (Math.abs(point.value) / maxValue) * plotWidth);
        const y = PAD + index * band + (band - thickness) / 2;

        return {
          key: `${index}-${point.label}`,
          d: barPath(plotLeft, y, w, thickness, 'right'),
          label: point.label,
          value: this.format(point.value),
          colour,
          x: plotLeft,
          y,
          w,
          h: thickness,
          labelX: plotLeft - LABEL_GAP,
          labelY: y + thickness / 2,
          valueX: plotLeft + w + LABEL_GAP,
          valueY: y + thickness / 2,
          anchor: 'end' as const,
        };
      });
    }

    const labelHeight = font * 1.6;
    const valueHeight = this.showValues() ? font * 1.4 : 0;
    const plotTop = PAD + valueHeight;
    const plotHeight = Math.max(10, this.height() - plotTop - PAD - labelHeight);
    const band = (this.width() - PAD * 2) / points.length;
    const thickness = Math.max(4, band - MARK_GAP * 2);

    return points.map((point, index) => {
      const h = Math.max(2, (Math.abs(point.value) / maxValue) * plotHeight);
      const x = PAD + index * band + (band - thickness) / 2;

      return {
        key: `${index}-${point.label}`,
        d: barPath(x, plotTop + plotHeight - h, thickness, h, 'top'),
        label: point.label,
        value: this.format(point.value),
        colour,
        x,
        y: plotTop + plotHeight - h,
        w: thickness,
        h,
        labelX: x + thickness / 2,
        labelY: plotTop + plotHeight + font * 1.1,
        valueX: x + thickness / 2,
        valueY: plotTop + plotHeight - h - font * 0.45,
        anchor: 'middle' as const,
      };
    });
  });

  /** Baseline for the column form, drawn recessively. */
  protected readonly baseline = computed(() => {
    const marks = this.bars();
    if (marks.length === 0 || this.kind() !== 'column') {
      return null;
    }

    const first = marks[0]!;
    return { y: first.y + first.h, x1: PAD, x2: this.width() - PAD };
  });

  protected readonly linePath = computed<LinePlot>(() => {
    const points = this.points();
    if (this.kind() !== 'line' || points.length === 0) {
      return { path: '', markers: [], labelY: 0 };
    }

    const font = this.fontSize();
    const labelHeight = font * 1.6;
    const valueHeight = this.showValues() ? font * 1.4 : 0;
    const plotTop = PAD + valueHeight;
    const plotHeight = Math.max(10, this.height() - plotTop - PAD - labelHeight);
    const maxValue = Math.max(...points.map((p) => p.value), 1);
    const minValue = Math.min(...points.map((p) => p.value), 0);
    const span = Math.max(1, maxValue - minValue);
    const step = points.length === 1 ? 0 : (this.width() - PAD * 2) / (points.length - 1);

    const markers = points.map((point, index) => ({
      key: `${index}-${point.label}`,
      cx: points.length === 1 ? this.width() / 2 : PAD + index * step,
      cy: plotTop + plotHeight - ((point.value - minValue) / span) * plotHeight,
      label: point.label,
      value: this.format(point.value),
    }));

    return {
      path: markers.map((m, i) => `${i === 0 ? 'M' : 'L'}${m.cx.toFixed(1)} ${m.cy.toFixed(1)}`).join(' '),
      markers,
      labelY: plotTop + plotHeight + font * 1.3,
    };
  });

  protected readonly slices = computed<PieMark[]>(() => {
    const points = this.points();
    if (!this.isPie() || points.length === 0) {
      return [];
    }

    const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0);
    if (total <= 0) {
      return [];
    }

    const cx = this.width() / 2;
    const cy = this.height() / 2;
    const font = this.fontSize();

    // Slice labels sit outside the circle, so the radius has to leave room for
    // the widest of them or they get clipped by the element box.
    const labelWidth = this.longestSliceLabel() * font * 0.55 + font;
    const radius = Math.max(
      10,
      Math.min(this.width() / 2 - PAD - labelWidth, this.height() / 2 - PAD - font * 1.2),
    );
    let angle = -Math.PI / 2;

    return points.map((point, index) => {
      const portion = Math.max(0, point.value) / total;
      const sweep = portion * Math.PI * 2;
      const end = angle + sweep;
      const mid = angle + sweep / 2;

      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;

      const labelRadius = radius + font * 0.7;
      const labelX = cx + labelRadius * Math.cos(mid);
      const anchor = Math.cos(mid) > 0.1 ? 'start' : Math.cos(mid) < -0.1 ? 'end' : 'middle';

      angle = end;

      return {
        key: `${index}-${point.label}`,
        d: `M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${radius} ${radius} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`,
        colour: seriesColour(index, this.dark()),
        label: `${point.label} ${Math.round(portion * 100)}%`,
        labelX,
        labelY: cy + labelRadius * Math.sin(mid) + font * 0.35,
        anchor,
      };
    });
  });

  private longestSliceLabel(): number {
    const total = this.points().reduce((sum, point) => sum + Math.max(0, point.value), 0) || 1;

    return Math.max(
      1,
      ...this.points().map((point) => `${point.label} ${Math.round((point.value / total) * 100)}%`.length),
    );
  }

  private longestLabel(): number {
    return Math.max(1, ...this.points().map((point) => point.label.length));
  }

  private format(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}
