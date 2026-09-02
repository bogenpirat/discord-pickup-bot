import { describe, expect, it } from 'vitest';
import {
  buildMmrSeries,
  EMPTY_SERIES,
  type MmrHistoryEntry,
} from '../../src/domain/valorant/mmrSeries.ts';
import { renderMmrChart } from '../../src/ui/mmrChart.ts';

const LABELS = {
  title: 'Bogenpirat#EUW · Immortal 2',
  subtitle: '3 matches · 2W 1L · +30 elo',
  empty: 'no ranked matches',
  unrated: 'unrated',
  unratedOnly: 'unrated across this window',
};

const baseOf = (tierId: number): number => (tierId - 3) * 100;

const entry = (tierId: number, rr: number, change: number, minutes: number): MmrHistoryEntry => ({
  elo: baseOf(tierId) + rr,
  rr,
  last_change: change,
  date: new Date(Date.parse('2026-08-01T18:00:00Z') + minutes * 60_000).toISOString(),
  tier: { id: tierId, name: tierId === 22 ? 'Immortal 2' : 'Immortal 1' },
});

/** A match the account played with no rank: tier 0, and an elo of 0 to match. */
const unrated = (minutes: number): MmrHistoryEntry => ({
  ...entry(0, 0, 0, minutes),
  elo: 0,
  tier: { id: 0, name: 'Unrated' },
});

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const climb = buildMmrSeries(
  [entry(21, 60, 0, 0), entry(21, 85, 25, 60), entry(22, 10, 25, 120)].reverse(),
);

describe('renderMmrChart', () => {
  it('answers a png', () => {
    const png = renderMmrChart(climb, LABELS);

    expect(png.subarray(0, 8).equals(SIGNATURE)).toBe(true);
  });

  it('is the same size whatever the data, so the embed never reflows', () => {
    const wide = renderMmrChart(climb, LABELS);
    const empty = renderMmrChart(EMPTY_SERIES, LABELS);

    expect(wide.readUInt32BE(16)).toBe(empty.readUInt32BE(16));
    expect(wide.readUInt32BE(20)).toBe(empty.readUInt32BE(20));
  });

  it("stays well under Discord's attachment limit", () => {
    expect(renderMmrChart(climb, LABELS).length).toBeLessThan(512 * 1024);
  });

  it('draws something for an empty series rather than throwing', () => {
    expect(() => renderMmrChart(EMPTY_SERIES, LABELS)).not.toThrow();
    expect(renderMmrChart(EMPTY_SERIES, LABELS).length).toBeGreaterThan(SIGNATURE.length);
  });

  // A single point makes the x scale degenerate and a flat series makes the y
  // scale degenerate; both used to be a divide by zero.
  it('handles a single match', () => {
    const single = buildMmrSeries([entry(21, 42, 20, 0)]);

    expect(() => renderMmrChart(single, LABELS)).not.toThrow();
  });

  it('handles a series that never moves', () => {
    const flat = buildMmrSeries(
      [entry(21, 50, 0, 0), entry(21, 50, 0, 60), entry(21, 50, 0, 120)].reverse(),
    );

    expect(() => renderMmrChart(flat, LABELS)).not.toThrow();
  });

  it('handles a series that spans many tiers', () => {
    const long = buildMmrSeries(
      Array.from({ length: 60 }, (_, index) =>
        entry(index % 2 === 0 ? 21 : 22, (index * 7) % 100, index % 3 === 0 ? -20 : 20, index * 30),
      ).reverse(),
    );

    expect(() => renderMmrChart(long, LABELS)).not.toThrow();
  });

  it('draws an unrated stretch differently from a rated one', () => {
    const withGap = buildMmrSeries(
      [entry(21, 60, 0, 0), unrated(60), entry(21, 85, 25, 120)].reverse(),
    );
    const withoutGap = buildMmrSeries(
      [entry(21, 60, 0, 0), entry(21, 70, 10, 60), entry(21, 85, 15, 120)].reverse(),
    );

    expect(renderMmrChart(withGap, LABELS).equals(renderMmrChart(withoutGap, LABELS))).toBe(false);
  });

  // The bug this guards: an unrated elo of 0 dragged the line to the floor, so
  // the same ranked matches drew differently depending on what sat between them.
  it('draws the rated matches the same whether or not an unrated one follows', () => {
    const withTrailing = buildMmrSeries([entry(21, 60, 0, 0), unrated(60)].reverse());
    const withoutTrailing = buildMmrSeries([entry(21, 60, 0, 0)]);

    expect(withTrailing.minElo).toBe(withoutTrailing.minElo);
    expect(withTrailing.maxElo).toBe(withoutTrailing.maxElo);
  });

  it('handles a window in which nothing was rated', () => {
    const none = buildMmrSeries([unrated(0), unrated(60), unrated(120)].reverse());

    expect(() => renderMmrChart(none, LABELS)).not.toThrow();
    expect(renderMmrChart(none, LABELS).equals(renderMmrChart(EMPTY_SERIES, LABELS))).toBe(false);
  });

  it('handles a window that opens and closes unrated', () => {
    const edges = buildMmrSeries([unrated(0), entry(21, 60, 0, 60), unrated(120)].reverse());

    expect(() => renderMmrChart(edges, LABELS)).not.toThrow();
  });

  // Elo and `last_change` are separate fields, and a refund upstream can make
  // them disagree, so a series can hold the same path with different deltas —
  // which is exactly what tells us whether the deltas reached the image.
  const path = (changes: readonly number[]): MmrHistoryEntry[] =>
    changes.map((change, index) => entry(21, 10 + index * 5, change, index * 60)).reverse();

  it('writes what each match was worth when the steps are wide enough', () => {
    const one = buildMmrSeries(path([20, 20, 20, 20, 20]));
    const other = buildMmrSeries(path([20, 21, 22, 23, 24]));

    expect(renderMmrChart(one, LABELS).equals(renderMmrChart(other, LABELS))).toBe(false);
  });

  it('leaves the deltas off once the matches are too close together to read', () => {
    const many = Array.from({ length: 40 }, () => 20);
    const one = buildMmrSeries(path(many));
    const other = buildMmrSeries(path(many.map((change, index) => change + (index % 5))));

    expect(renderMmrChart(one, LABELS).equals(renderMmrChart(other, LABELS))).toBe(true);
  });

  // The bridge spans however many matches went unrated, so no single match's
  // delta can label it.
  it('does not write a delta over a bridge across unrated matches', () => {
    const bridged = (change: number): MmrHistoryEntry[] =>
      [entry(21, 20, 20, 0), unrated(60), entry(21, 50, change, 120)].reverse();

    const one = renderMmrChart(buildMmrSeries(bridged(25)), LABELS);
    const other = renderMmrChart(buildMmrSeries(bridged(26)), LABELS);

    expect(one.equals(other)).toBe(true);
  });

  it('draws a different image when the data differs', () => {
    const fall = buildMmrSeries(
      [entry(22, 10, 0, 0), entry(21, 85, -25, 60), entry(21, 60, -25, 120)].reverse(),
    );

    expect(renderMmrChart(climb, LABELS).equals(renderMmrChart(fall, LABELS))).toBe(false);
  });

  it('is deterministic, so the same series renders identically', () => {
    expect(renderMmrChart(climb, LABELS).equals(renderMmrChart(climb, LABELS))).toBe(true);
  });

  it('reflects the labels it is given', () => {
    const other = renderMmrChart(climb, { ...LABELS, title: 'Someone Else#NA1 · Radiant' });

    expect(renderMmrChart(climb, LABELS).equals(other)).toBe(false);
  });
});
