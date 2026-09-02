import type { MmrPoint, MmrSeries, TierBand } from '../domain/valorant/mmrSeries.ts';
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
  /** The column behind a stretch of matches the account played with no rank. */
  unratedPanel: '#ffffff09',
  unratedEdge: '#ffffff24',
  unrated: '#79808f',
} as const;

/** How far a rank-change label sits from the line, one entry per lane. */
const LABEL_LANES: readonly number[] = [22, 34, 46];
/** Clear pixels required between two labels sharing a lane. */
const LABEL_GAP = 6;
/** Padding either side of an unrated caption, below which it is left out. */
const CAPTION_MARGIN = 8;

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
  /** Caption over a stretch of matches played with no rank. */
  readonly unrated: string;
  /** Shown centred when not one match in the window carried a rank. */
  readonly unratedOnly: string;
}

/** A maximal stretch of neighbouring points that are all rated, or all not. */
interface Run {
  readonly start: number;
  readonly end: number;
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

const runsOf = (points: readonly MmrPoint[], rated: boolean): readonly Run[] => {
  const runs: Run[] = [];

  for (const [index, point] of points.entries()) {
    if (point.rated !== rated) {
      continue;
    }
    const open = runs[runs.length - 1];
    if (open !== undefined && open.end === index - 1) {
      runs[runs.length - 1] = { start: open.start, end: index };
    } else {
      runs.push({ start: index, end: index });
    }
  }

  return runs;
};

export const renderMmrChart = (series: MmrSeries, labels: MmrChartLabels): Buffer => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  canvas.fill(COLOURS.background);
  canvas.rect(plot.left, plot.top, plotWidth, plotHeight, COLOURS.panel);

  drawText(canvas, labels.title, PADDING.left, 12, COLOURS.title, SCALE);
  drawText(canvas, labels.subtitle, PADDING.left, 12 + textHeight(SCALE) + 5, COLOURS.label, 1);

  const centred = (text: string): void => {
    drawText(
      canvas,
      text,
      plot.left + (plotWidth - textWidth(text, SCALE)) / 2,
      plot.top + plotHeight / 2 - textHeight(SCALE) / 2,
      COLOURS.label,
      SCALE,
    );
  };

  if (series.points.length === 0) {
    centred(labels.empty);
    return canvas.toPng();
  }

  const { low, high } = rangeOf(series);
  const yFor = (elo: number): number => plot.bottom - ((elo - low) / (high - low)) * plotHeight;
  const xFor = (index: number): number =>
    series.points.length === 1
      ? plot.left + plotWidth / 2
      : plot.left + (index / (series.points.length - 1)) * plotWidth;

  const pointAt = (index: number): MmrPoint | undefined => series.points[index];

  const nearestRated = (index: number, step: -1 | 1): number | null => {
    for (let at = index + step; at >= 0 && at < series.points.length; at += step) {
      if (pointAt(at)?.rated === true) {
        return at;
      }
    }
    return null;
  };

  /**
   * Where an unrated match is drawn: on the straight run between the ratings
   * either side of it, or level with whichever side there is.
   *
   * Nothing is known about the rating during such a match, so this height makes
   * no claim — the dashes and the shaded column are what say so. It only has to
   * be somewhere the eye reads as continuous, which the elo of 0 the API reports
   * is emphatically not.
   */
  const baselineFor = (index: number): number => {
    const previous = nearestRated(index, -1);
    const next = nearestRated(index, 1);
    const before = previous === null ? undefined : pointAt(previous);
    const after = next === null ? undefined : pointAt(next);

    // At least one side exists by here: a window with no rating at all never
    // reaches this, having drawn its own plot and returned above.
    if (before === undefined || after === undefined || previous === null || next === null) {
      return yFor((before ?? after)?.elo ?? series.maxElo);
    }

    const progress = (index - previous) / (next - previous);
    return yFor(before.elo + (after.elo - before.elo) * progress);
  };

  const shade = (left: number, right: number): void => {
    canvas.rect(left, plot.top, Math.max(1, right - left), plotHeight, COLOURS.unratedPanel);
    if (left > plot.left) {
      canvas.dashedLine(left, plot.top, left, plot.bottom, COLOURS.unratedEdge);
    }
    if (right < plot.right) {
      canvas.dashedLine(right, plot.top, right, plot.bottom, COLOURS.unratedEdge);
    }
  };

  // With no rating anywhere in the window there is no scale to draw against, so
  // the chart says so rather than inventing one. The matches still get their
  // marks, on a line through the middle that stands for nothing but the passage
  // of time.
  if (series.ratedCount === 0) {
    const middle = plot.top + plotHeight / 2;
    shade(plot.left, plot.right);
    canvas.line(plot.left, plot.top, plot.left, plot.bottom, COLOURS.axis);
    canvas.line(plot.left, plot.bottom, plot.right, plot.bottom, COLOURS.axis);
    canvas.dashedLine(plot.left, middle, plot.right, middle, COLOURS.unrated, 2);
    for (const [index] of series.points.entries()) {
      canvas.disc(xFor(index), middle, 3, COLOURS.unrated);
      canvas.disc(xFor(index), middle, 1, COLOURS.panel);
    }
    // Clear of the line, which would otherwise strike the words through.
    const width = textWidth(labels.unratedOnly, SCALE);
    drawText(
      canvas,
      labels.unratedOnly,
      plot.left + (plotWidth - width) / 2,
      middle - textHeight(SCALE) - 14,
      COLOURS.label,
      SCALE,
    );
    drawText(canvas, '0 matches', plot.left, plot.bottom + 12, COLOURS.label);
    return canvas.toPng();
  }

  // The unrated columns go down first, so the bands, the line and the markers
  // all sit on top of them.
  const unratedRuns = runsOf(series.points, false);

  for (const run of unratedRuns) {
    // Bounded by the matches either side rather than by its own, so the column
    // covers exactly the stretch over which the rating is unknown: it starts at
    // the last rating there was and ends at the next one there is.
    const left = run.start === 0 ? plot.left : xFor(run.start - 1);
    const right = run.end === series.points.length - 1 ? plot.right : xFor(run.end + 1);

    shade(left, right);

    const width = textWidth(labels.unrated);
    if (width + CAPTION_MARGIN <= right - left) {
      drawText(canvas, labels.unrated, (left + right - width) / 2, plot.top + 6, COLOURS.unrated);
    }
  }

  // Tier boundaries next, so the line and its markers sit on top of them.
  for (const band of bandsInRange(series.bands, low, high)) {
    const y = yFor(band.baseElo);
    canvas.dashedRow(y, plot.left, plot.right, COLOURS.gridStrong);
    const label = band.name;
    drawText(canvas, label, plot.left - 10 - textWidth(label), y - textHeight() / 2, COLOURS.label);
  }

  // The current tier's own floor is what the player is standing on, so it gets a
  // solid line where the others are dashed. Read off the last *rated* match: a
  // window that ends unrated still stands on the last rank it held.
  const lastRated = [...series.points].reverse().find((point) => point.rated);
  const currentBand = series.bands.find((band) => band.tierId === lastRated?.tierId);
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
  // would leave the gaps between them empty and come out as stripes. It stops at
  // the edge of each rated stretch: a filled body under a bridge would give an
  // unknown rating the same weight as a measured one.
  const span = plotWidth / Math.max(1, series.points.length - 1);

  for (const run of runsOf(series.points, true)) {
    const single = run.start === run.end;
    const from = single ? xFor(run.start) - 2 : xFor(run.start);
    const to = single ? xFor(run.end) + 2 : xFor(run.end);

    for (let x = Math.round(from); x <= Math.round(to); x += 1) {
      const slot = Math.max(run.start, Math.min(run.end - 1, Math.floor((x - plot.left) / span)));
      const left = pointAt(single ? run.start : slot);
      const right = pointAt(single ? run.start : slot + 1) ?? left;
      if (left === undefined || right === undefined) {
        continue;
      }
      const progress = single ? 0 : Math.max(0, Math.min(1, (x - xFor(slot)) / span));
      const y = Math.round(yFor(left.elo + (right.elo - left.elo) * progress));
      canvas.rect(x, y, 1, plot.bottom - y, COLOURS.fill);
    }
  }

  // One segment per pair of neighbouring matches. Where either end is unrated
  // the segment is dashed and grey: it joins the ratings that are known so the
  // line stays readable, without asserting what went on between them.
  for (let index = 1; index < series.points.length; index += 1) {
    const previous = pointAt(index - 1);
    const current = pointAt(index);
    if (previous === undefined || current === undefined) {
      continue;
    }

    const fromY = previous.rated ? yFor(previous.elo) : baselineFor(index - 1);
    const toY = current.rated ? yFor(current.elo) : baselineFor(index);

    if (previous.rated && current.rated) {
      const colour = current.change >= 0 ? COLOURS.win : COLOURS.loss;
      canvas.line(xFor(index - 1), fromY, xFor(index), toY, colour, 3);
    } else {
      canvas.dashedLine(xFor(index - 1), fromY, xFor(index), toY, COLOURS.unrated, 2);
    }
  }

  // A window that opens or closes unrated has no rating on that side to bridge
  // to, so the dashes carry on level to the edge of the plot.
  for (const run of unratedRuns) {
    if (run.start === 0) {
      const y = baselineFor(0);
      canvas.dashedLine(plot.left, y, xFor(0), y, COLOURS.unrated, 2);
    }
    if (run.end === series.points.length - 1) {
      const y = baselineFor(run.end);
      canvas.dashedLine(xFor(run.end), y, plot.right, y, COLOURS.unrated, 2);
    }
  }

  for (const [index, point] of series.points.entries()) {
    if (point.rated) {
      canvas.disc(xFor(index), yFor(point.elo), 3, point.change >= 0 ? COLOURS.win : COLOURS.loss);
      continue;
    }
    // Hollow and grey, so a match with no rating behind it never reads as a
    // won or lost one.
    canvas.disc(xFor(index), baselineFor(index), 3, COLOURS.unrated);
    canvas.disc(xFor(index), baselineFor(index), 1, COLOURS.panel);
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
    const point = pointAt(change.index);
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

  // The count next to the net is of the matches that moved it, so an unrated
  // stretch is not quietly folded into a record it had no part in.
  drawText(canvas, `${series.ratedCount} matches`, plot.left, plot.bottom + 12, COLOURS.label);
  const net = `${series.netChange >= 0 ? '+' : ''}${series.netChange} elo`;
  drawText(
    canvas,
    net,
    plot.right - textWidth(net),
    plot.bottom + 12,
    series.netChange >= 0 ? COLOURS.win : COLOURS.loss,
  );

  return canvas.toPng();
};
