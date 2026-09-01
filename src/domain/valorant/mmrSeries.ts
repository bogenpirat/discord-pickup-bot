/**
 * The shape this module needs out of an MMR history entry, named structurally so
 * the domain does not depend on the generated API types. Both the live and the
 * stored history endpoints answer with these fields.
 */
export interface MmrHistoryEntry {
  readonly elo: number;
  readonly rr: number;
  readonly last_change: number;
  readonly date: string;
  readonly tier: { readonly id: number; readonly name: string };
  readonly map?: { readonly name?: string } | undefined;
  readonly was_derank_protected?: boolean | undefined;
}

export interface MmrPoint {
  readonly elo: number;
  readonly rr: number;
  readonly change: number;
  readonly tierId: number;
  readonly tierName: string;
  readonly at: number;
  readonly mapName: string | null;
}

/** A tier's lower edge in elo, used to draw and label the bands behind the line. */
export interface TierBand {
  readonly tierId: number;
  readonly name: string;
  readonly baseElo: number;
}

export interface RankChange {
  /** Index into `points` of the match that ended in the new tier. */
  readonly index: number;
  readonly direction: 'up' | 'down';
  readonly from: string;
  readonly to: string;
}

export interface MmrSeries {
  /** Oldest first, so the chart reads left to right in time. */
  readonly points: readonly MmrPoint[];
  readonly bands: readonly TierBand[];
  readonly changes: readonly RankChange[];
  readonly minElo: number;
  readonly maxElo: number;
  readonly netChange: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export const EMPTY_SERIES: MmrSeries = {
  points: [],
  bands: [],
  changes: [],
  minElo: 0,
  maxElo: 0,
  netChange: 0,
  wins: 0,
  losses: 0,
  draws: 0,
};

const isNonEmpty = <T>(items: readonly T[]): items is readonly [T, ...T[]] => items.length > 0;

const timeOf = (date: string): number => {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toPoint = (entry: MmrHistoryEntry): MmrPoint => ({
  elo: entry.elo,
  rr: entry.rr,
  change: entry.last_change,
  tierId: entry.tier.id,
  tierName: entry.tier.name,
  at: timeOf(entry.date),
  mapName: entry.map?.name ?? null,
});

/**
 * The elo a tier starts at. Derived from the data rather than from a hardcoded
 * rank table: `elo` is the tier's base plus the rank rating within it, so
 * subtracting one from the other lands exactly on the boundary — and keeps
 * working when Riot adds or renames a tier.
 */
const bandsFrom = (points: readonly MmrPoint[]): readonly TierBand[] => {
  const byTier = new Map<number, TierBand>();

  for (const point of points) {
    if (!byTier.has(point.tierId)) {
      byTier.set(point.tierId, {
        tierId: point.tierId,
        name: point.tierName,
        baseElo: point.elo - point.rr,
      });
    }
  }

  return [...byTier.values()].sort((a, b) => a.baseElo - b.baseElo);
};

const changesIn = (points: readonly MmrPoint[]): readonly RankChange[] => {
  const changes: RankChange[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined || previous.tierId === current.tierId) {
      continue;
    }
    changes.push({
      index,
      direction: current.tierId > previous.tierId ? 'up' : 'down',
      from: previous.tierName,
      to: current.tierName,
    });
  }

  return changes;
};

/**
 * Turns a raw history into everything the chart and the summary need.
 *
 * The API answers newest first; this sorts oldest first so time runs left to
 * right. Entries that carry the same timestamp keep the order they arrived in,
 * reversed — two matches finishing in the same second is rare but a stable order
 * beats an arbitrary one.
 */
export const buildMmrSeries = (history: readonly MmrHistoryEntry[]): MmrSeries => {
  const points = [...history]
    .reverse()
    .map(toPoint)
    .sort((a, b) => a.at - b.at);

  // Narrowing to a non-empty tuple here rather than checking `history` up front:
  // it is the same early return, and it lets the rest of the function index the
  // ends without a null check that nothing could ever reach.
  if (!isNonEmpty(points)) {
    return EMPTY_SERIES;
  }

  const elos = points.map((point) => point.elo);
  const first = points[0];
  // `reduce` with no seed yields the last element without an index access, which
  // would otherwise widen to `| undefined`.
  const last = points.reduce((_, point) => point);

  return {
    points,
    bands: bandsFrom(points),
    changes: changesIn(points),
    minElo: Math.min(...elos),
    maxElo: Math.max(...elos),
    // Measured across the window rather than by summing `last_change`, so a
    // refund or a correction upstream cannot make the total disagree with the
    // endpoints the chart actually draws.
    netChange: last.elo - first.elo,
    wins: points.filter((point) => point.change > 0).length,
    losses: points.filter((point) => point.change < 0).length,
    draws: points.filter((point) => point.change === 0).length,
  };
};
