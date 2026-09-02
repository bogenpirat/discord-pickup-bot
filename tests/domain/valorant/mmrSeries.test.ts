import { describe, expect, it } from 'vitest';
import {
  buildMmrSeries,
  EMPTY_SERIES,
  type MmrHistoryEntry,
} from '../../../src/domain/valorant/mmrSeries.ts';

const TIERS: Readonly<Record<number, string>> = {
  20: 'Ascendant 3',
  21: 'Immortal 1',
  22: 'Immortal 2',
  23: 'Immortal 3',
};

/** Elo is the tier's base plus the rank rating inside it. */
const baseOf = (tierId: number): number => (tierId - 3) * 100;

const entry = (
  tierId: number,
  rr: number,
  change: number,
  minutesFromStart: number,
): MmrHistoryEntry => ({
  elo: baseOf(tierId) + rr,
  rr,
  last_change: change,
  date: new Date(Date.parse('2026-08-01T18:00:00Z') + minutesFromStart * 60_000).toISOString(),
  tier: { id: tierId, name: TIERS[tierId] ?? `Tier ${tierId}` },
  map: { name: 'Ascent' },
});

/**
 * How the API reports a match played with no rank: tier 0, and an elo of 0 that
 * means "no rating" rather than "a rating of zero".
 */
const unrated = (minutesFromStart: number): MmrHistoryEntry => ({
  elo: 0,
  rr: 0,
  last_change: 0,
  date: new Date(Date.parse('2026-08-01T18:00:00Z') + minutesFromStart * 60_000).toISOString(),
  tier: { id: 0, name: 'Unrated' },
  map: { name: 'Ascent' },
});

/** The API answers newest first, which is the order this takes. */
const newestFirst = (...entries: MmrHistoryEntry[]): MmrHistoryEntry[] => [...entries].reverse();

describe('buildMmrSeries', () => {
  it('returns the empty series for no history', () => {
    expect(buildMmrSeries([])).toBe(EMPTY_SERIES);
  });

  it('puts the oldest match first, whichever order it arrived in', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 10, 10, 0), entry(21, 30, 20, 60), entry(21, 50, 20, 120)),
    );

    expect(series.points.map((point) => point.rr)).toEqual([10, 30, 50]);
  });

  it('reads every field off the entry', () => {
    const series = buildMmrSeries([entry(22, 40, -18, 0)]);

    expect(series.points[0]).toEqual({
      elo: 1940,
      rr: 40,
      change: -18,
      tierId: 22,
      tierName: 'Immortal 2',
      at: Date.parse('2026-08-01T18:00:00Z'),
      mapName: 'Ascent',
      rated: true,
    });
  });

  it('survives an entry with no map', () => {
    const bare: MmrHistoryEntry = { ...entry(21, 10, 5, 0), map: undefined };

    expect(buildMmrSeries([bare]).points[0]?.mapName).toBeNull();
  });

  it('treats an unparseable date as the epoch rather than throwing', () => {
    const broken: MmrHistoryEntry = { ...entry(21, 10, 5, 0), date: 'not a date' };

    expect(buildMmrSeries([broken]).points[0]?.at).toBe(0);
  });

  it('reports the elo range across the window', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 10, 0, 0), entry(21, 80, 70, 60), entry(21, 40, -40, 120)),
    );

    expect(series.minElo).toBe(1810);
    expect(series.maxElo).toBe(1880);
  });

  it('measures the net change between the first and last match', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 10, 0, 0), entry(21, 90, 80, 60), entry(22, 15, 25, 120)),
    );

    expect(series.netChange).toBe(1915 - 1810);
  });

  // Summing last_change would disagree with the endpoints the chart draws
  // whenever the API refunds or corrects RR upstream.
  it('measures the net change from the elo, not from the reported changes', () => {
    const series = buildMmrSeries(newestFirst(entry(21, 10, 999, 0), entry(21, 30, 999, 60)));

    expect(series.netChange).toBe(20);
  });

  it('counts wins, losses and draws by the reported change', () => {
    const series = buildMmrSeries(
      newestFirst(
        entry(21, 10, 20, 0),
        entry(21, 5, -5, 60),
        entry(21, 5, 0, 120),
        entry(21, 25, 20, 180),
      ),
    );

    expect(series).toMatchObject({ wins: 2, losses: 1, draws: 1 });
  });

  it('derives each tier band from the elo the data reports', () => {
    const series = buildMmrSeries(newestFirst(entry(21, 90, 0, 0), entry(22, 10, 20, 60)));

    expect(series.bands).toEqual([
      { tierId: 21, name: 'Immortal 1', baseElo: 1800 },
      { tierId: 22, name: 'Immortal 2', baseElo: 1900 },
    ]);
  });

  it('lists each tier once, sorted upwards', () => {
    const series = buildMmrSeries(
      newestFirst(entry(22, 10, 0, 0), entry(21, 90, -20, 60), entry(22, 10, 20, 120)),
    );

    expect(series.bands.map((band) => band.tierId)).toEqual([21, 22]);
  });

  it('finds no rank change in a flat tier', () => {
    const series = buildMmrSeries(newestFirst(entry(21, 10, 0, 0), entry(21, 30, 20, 60)));

    expect(series.changes).toEqual([]);
  });

  it('marks a promotion at the match that reached the new tier', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 90, 0, 0), entry(22, 10, 20, 60), entry(22, 30, 20, 120)),
    );

    expect(series.changes).toEqual([
      { index: 1, direction: 'up', from: 'Immortal 1', to: 'Immortal 2' },
    ]);
  });

  it('marks a demotion', () => {
    const series = buildMmrSeries(newestFirst(entry(22, 5, 0, 0), entry(21, 85, -20, 60)));

    expect(series.changes).toEqual([
      { index: 1, direction: 'down', from: 'Immortal 2', to: 'Immortal 1' },
    ]);
  });

  it('marks every crossing when the rank moves more than once', () => {
    const series = buildMmrSeries(
      newestFirst(
        entry(21, 90, 0, 0),
        entry(22, 10, 20, 60),
        entry(21, 90, -20, 120),
        entry(22, 10, 20, 180),
        entry(23, 5, 25, 240),
      ),
    );

    expect(series.changes.map((change) => `${change.direction}:${change.to}`)).toEqual([
      'up:Immortal 2',
      'down:Immortal 1',
      'up:Immortal 2',
      'up:Immortal 3',
    ]);
  });

  it('handles a single match', () => {
    const series = buildMmrSeries([entry(21, 42, 20, 0)]);

    expect(series.points).toHaveLength(1);
    expect(series.changes).toEqual([]);
    expect(series.netChange).toBe(0);
    expect(series.minElo).toBe(series.maxElo);
  });

  it('marks a match played with no rank', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 10, 0, 0), unrated(60), entry(21, 30, 20, 120)),
    );

    expect(series.points.map((point) => point.rated)).toEqual([true, false, true]);
    expect(series.ratedCount).toBe(2);
  });

  // The whole reason `rated` exists: an unrated elo of 0 used to reach the range
  // and drag the chart to the floor over a state that has no rating at all.
  it('keeps an unrated match out of the range and the net', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 10, 0, 0), unrated(60), entry(21, 30, 20, 120)),
    );

    expect(series.minElo).toBe(1810);
    expect(series.maxElo).toBe(1830);
    expect(series.netChange).toBe(20);
  });

  it('measures the net between the ratings at the ends, not the matches at them', () => {
    const series = buildMmrSeries(
      newestFirst(unrated(0), entry(21, 10, 0, 60), entry(21, 40, 30, 120), unrated(180)),
    );

    expect(series.netChange).toBe(30);
    expect(series.minElo).toBe(1810);
  });

  it('does not read a tier band off an unrated match', () => {
    const series = buildMmrSeries(newestFirst(unrated(0), entry(21, 10, 0, 60)));

    expect(series.bands.map((band) => band.baseElo)).toEqual([1800]);
  });

  it('leaves unrated matches out of the record', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 10, 10, 0), unrated(60), unrated(120), entry(21, 30, 20, 180)),
    );

    expect([series.wins, series.losses, series.draws]).toEqual([2, 0, 0]);
    expect(series.points).toHaveLength(4);
  });

  it('does not report a stretch of unrated matches as a fall and a climb', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 90, 0, 0), unrated(60), entry(21, 20, -70, 120)),
    );

    expect(series.changes).toEqual([]);
  });

  it('still reports a tier that differs either side of an unrated stretch', () => {
    const series = buildMmrSeries(
      newestFirst(entry(21, 90, 0, 0), unrated(60), entry(22, 20, 30, 120)),
    );

    expect(series.changes).toEqual([
      { index: 2, direction: 'up', from: 'Immortal 1', to: 'Immortal 2' },
    ]);
  });

  it('reports a window with no rank at all as having nothing to scale', () => {
    const series = buildMmrSeries(newestFirst(unrated(0), unrated(60), unrated(120)));

    expect(series.points).toHaveLength(3);
    expect(series.ratedCount).toBe(0);
    expect([series.minElo, series.maxElo, series.netChange]).toEqual([0, 0, 0]);
    expect(series.bands).toEqual([]);
  });

  it('does not mutate the history it was given', () => {
    const history = newestFirst(entry(21, 10, 0, 0), entry(21, 30, 20, 60));
    const before = history.map((item) => item.elo);

    buildMmrSeries(history);

    expect(history.map((item) => item.elo)).toEqual(before);
  });
});
