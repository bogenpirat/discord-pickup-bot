import type { MmrSeries, TierBand } from '../domain/valorant/mmrSeries.ts';
import { createCanvas } from '../lib/image/canvas.ts';
import { drawText, textHeight, textWidth } from '../lib/image/font.ts';

const WIDTH = 900;
const HEIGHT = 380;
const PADDING = { top: 46, right: 22, bottom: 40, left: 96 };
const SCALE = 2;

const COLOURS = {
  background: '#14151a',
  panel: '#1b1d25',
  grid: '#ffffff14',
  gridStrong: '#ffffff2e',
  axis: '#3a3f4d',
  label: '#8f96a5',
  title: '#e6e7ea',
  line: '#ff4655',
  fill: '#ff465522',
  win: '#4ade80',
  loss: '#ff6b6b',
  up: '#4ade80',
  down: '#ff4655',
  marker: '#14151a',
} as const;

/** How far a rank-change label sits from the line, one entry per lane. */
const LABEL_LANES: readonly number[] = [22, 34, 46];
/** Clear pixels required between two labels sharing a lane. */
const LABEL_GAP = 6;

const plot = {
  left: PADDING.left,
  top: PADDING.top,
  right: WIDTH - PADDING.right,
  bottom: HEIGHT - PADDING.bottom,
};
const plotWidth = plot.right - plot.left;
const plotHeight = plot.bottom - plot.top;

export interface MmrChartLabels {
  readonly title: string;
  readonly subtitle: string;
  /** Shown centred when the series has nothing to draw. */
  readonly empty: string;
}

/** Rounds the visible range out to whole tiers where it can, so bands read evenly. */
const rangeOf = (series: MmrSeries): { readonly low: number; readonly high: number } => {
  const spread = series.maxElo - series.minElo;
  // A flat series would otherwise divide by zero and draw a line through the
  // middle of nothing; give it a nominal window so the padding maths holds.
  const padding = Math.max(12, Math.round(spread * 0.18));
  return { low: series.minElo - padding, high: series.maxElo + padding };
};

const bandsInRange = (bands: readonly TierBand[], low: number, high: number): readonly TierBand[] =>
  bands.filter((band) => band.baseElo >= low && band.baseElo <= high);

export const renderMmrChart = (series: MmrSeries, labels: MmrChartLabels): Buffer => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  canvas.fill(COLOURS.background);
  canvas.rect(plot.left, plot.top, plotWidth, plotHeight, COLOURS.panel);

  drawText(canvas, labels.title, PADDING.left, 12, COLOURS.title, SCALE);
  drawText(canvas, labels.subtitle, PADDING.left, 12 + textHeight(SCALE) + 5, COLOURS.label, 1);

  if (series.points.length === 0) {
    drawText(
      canvas,
      labels.empty,
      plot.left + (plotWidth - textWidth(labels.empty, SCALE)) / 2,
      plot.top + plotHeight / 2 - textHeight(SCALE) / 2,
      COLOURS.label,
      SCALE,
    );
    return canvas.toPng();
  }

  const { low, high } = rangeOf(series);
  const yFor = (elo: number): number => plot.bottom - ((elo - low) / (high - low)) * plotHeight;
  const xFor = (index: number): number =>
    series.points.length === 1
      ? plot.left + plotWidth / 2
      : plot.left + (index / (series.points.length - 1)) * plotWidth;

  // Tier boundaries first, so the line and its markers sit on top of them.
  for (const band of bandsInRange(series.bands, low, high)) {
    const y = yFor(band.baseElo);
    canvas.dashedRow(y, plot.left, plot.right, COLOURS.gridStrong);
    const label = band.name;
    drawText(canvas, label, plot.left - 10 - textWidth(label), y - textHeight() / 2, COLOURS.label);
  }

  // The current tier's own floor is what the player is standing on, so it gets a
  // solid line where the others are dashed.
  const currentBand = series.bands.find(
    (band) => band.tierId === series.points[series.points.length - 1]?.tierId,
  );
  if (currentBand !== undefined && currentBand.baseElo >= low && currentBand.baseElo <= high) {
    canvas.line(
      plot.left,
      yFor(currentBand.baseElo),
      plot.right,
      yFor(currentBand.baseElo),
      COLOURS.grid,
    );
  }

  canvas.line(plot.left, plot.top, plot.left, plot.bottom, COLOURS.axis);
  canvas.line(plot.left, plot.bottom, plot.right, plot.bottom, COLOURS.axis);

  // A translucent column at every x under the curve, which reads as an area fill
  // without needing a polygon scanline filler. Drawing one per *point* instead
  // would leave the gaps between them empty and come out as stripes.
  const eloAt = (x: number): number => {
    const span = plotWidth / Math.max(1, series.points.length - 1);
    const slot = Math.min(series.points.length - 2, Math.floor((x - plot.left) / span));
    const left = series.points[Math.max(0, slot)];
    const right = series.points[Math.max(0, slot) + 1] ?? left;
    if (left === undefined || right === undefined) {
      return 0;
    }
    const t = Math.max(0, Math.min(1, (x - xFor(Math.max(0, slot))) / span));
    return left.elo + (right.elo - left.elo) * t;
  };

  for (let x = plot.left; x <= plot.right; x += 1) {
    const y = Math.round(
      yFor(series.points.length === 1 ? (series.points[0]?.elo ?? 0) : eloAt(x)),
    );
    canvas.rect(x, y, 1, plot.bottom - y, COLOURS.fill);
  }

  for (let index = 1; index < series.points.length; index += 1) {
    const previous = series.points[index - 1];
    const current = series.points[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    canvas.line(
      xFor(index - 1),
      yFor(previous.elo),
      xFor(index),
      yFor(current.elo),
      current.change >= 0 ? COLOURS.win : COLOURS.loss,
      3,
    );
  }

  for (const [index, point] of series.points.entries()) {
    canvas.disc(xFor(index), yFor(point.elo), 3, point.change >= 0 ? COLOURS.win : COLOURS.loss);
  }

  // Rank changes last of all: they are the thing the chart is for.
  //
  // A run of promotions lands their labels on top of each other, so each one is
  // offered a lane further from the line until it finds a free stretch of x. A
  // change with nowhere to put its text still gets its marker.
  const occupied: { readonly lane: number; readonly from: number; readonly to: number }[] = [];

  const claim = (lane: number, from: number, to: number): boolean => {
    const clash = occupied.some(
      (taken) => taken.lane === lane && from < taken.to + LABEL_GAP && taken.from < to + LABEL_GAP,
    );
    if (clash) {
      return false;
    }
    occupied.push({ lane, from, to });
    return true;
  };

  for (const change of series.changes) {
    const point = series.points[change.index];
    if (point === undefined) {
      continue;
    }
    const x = xFor(change.index);
    const y = yFor(point.elo);
    const colour = change.direction === 'up' ? COLOURS.up : COLOURS.down;

    canvas.line(x, plot.top, x, plot.bottom, `${colour}33`);
    canvas.disc(x, y, 7, colour);
    canvas.disc(x, y, 4, COLOURS.marker);
    canvas.triangle(x, y, 3, change.direction === 'up', colour);

    const label = change.to;
    const width = textWidth(label);
    const left = Math.min(plot.right - width, Math.max(plot.left, x - width / 2));
    const lane = LABEL_LANES.findIndex((_, index) => claim(index, left, left + width));

    if (lane === -1) {
      continue;
    }

    const offset = LABEL_LANES[lane] ?? 0;
    drawText(
      canvas,
      label,
      left,
      change.direction === 'up' ? y - offset : y + offset - textHeight() + 1,
      colour,
    );
  }

  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  if (first !== undefined && last !== undefined) {
    drawText(canvas, `${series.points.length} matches`, plot.left, plot.bottom + 12, COLOURS.label);
    const net = `${series.netChange >= 0 ? '+' : ''}${series.netChange} elo`;
    drawText(
      canvas,
      net,
      plot.right - textWidth(net),
      plot.bottom + 12,
      series.netChange >= 0 ? COLOURS.win : COLOURS.loss,
    );
  }

  return canvas.toPng();
};
