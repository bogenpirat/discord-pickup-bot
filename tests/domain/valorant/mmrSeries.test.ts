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

  it('does not mutate the history it was given', () => {
    const history = newestFirst(entry(21, 10, 0, 0), entry(21, 30, 20, 60));
    const before = history.map((item) => item.elo);

    buildMmrSeries(history);

    expect(history.map((item) => item.elo)).toEqual(before);
  });
});
