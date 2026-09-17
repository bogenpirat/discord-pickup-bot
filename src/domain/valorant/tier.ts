/**
 * Riot's competitive ladder, addressed by the tier id the API reports.
 *
 * Ids 0 to 2 are the unranked end of the scale, so the named groups start at 3
 * and run three divisions each until Radiant, which has none. Knowing the shape
 * rather than a list of names is what lets a team's *average* be named: the mean
 * of a side's tiers is rarely a tier any of its players actually holds, so it
 * cannot be looked up in the match data.
 */
const FIRST_RANKED_TIER = 3;
const DIVISIONS_PER_GROUP = 3;

interface TierGroup {
  readonly name: string;
  /** Kept to two characters so the scoreboard column stays three wide. */
  readonly short: string;
}

const GROUPS: readonly TierGroup[] = [
  { name: 'Iron', short: 'I' },
  { name: 'Bronze', short: 'B' },
  { name: 'Silver', short: 'S' },
  { name: 'Gold', short: 'G' },
  { name: 'Platinum', short: 'P' },
  { name: 'Diamond', short: 'D' },
  { name: 'Ascendant', short: 'A' },
  { name: 'Immortal', short: 'Im' },
];

const RADIANT = {
  tier: FIRST_RANKED_TIER + GROUPS.length * DIVISIONS_PER_GROUP,
  name: 'Radiant',
  short: 'Rad',
} as const;

const groupOf = (tierId: number): { group: TierGroup; division: number } | null => {
  if (tierId < FIRST_RANKED_TIER || tierId >= RADIANT.tier) {
    return null;
  }

  const offset = Math.floor(tierId) - FIRST_RANKED_TIER;
  const group = GROUPS[Math.floor(offset / DIVISIONS_PER_GROUP)];
  return group === undefined ? null : { group, division: (offset % DIVISIONS_PER_GROUP) + 1 };
};

/**
 * Whether a tier id names a rank on the ladder.
 *
 * Ids below the first ranked tier are the unrated state — an account in
 * placements, or one that has not played the act out. The API reports those
 * with an elo of 0, which is the absence of a rating rather than a rating of
 * zero, so anything that scales or averages elo has to ask this first.
 */
export const isRankedTier = (tierId: number): boolean => tierId >= FIRST_RANKED_TIER;

/**
 * The full name of a tier, or null for anything off the ladder — including a
 * rank Riot might add above Radiant, which is better left unnamed than guessed.
 */
export const tierName = (tierId: number): string | null => {
  if (tierId === RADIANT.tier) {
    return RADIANT.name;
  }

  const found = groupOf(tierId);
  return found === null ? null : `${found.group.name} ${found.division}`;
};

/**
 * The same tier in three characters or fewer, for the scoreboard column, or
 * null for a player with no rank — an unrated mode ranks nobody, and a column
 * of placeholders is worse than no column.
 */
export const tierShortName = (tierId: number | null): string | null => {
  if (tierId === RADIANT.tier) {
    return RADIANT.short;
  }

  const found = tierId === null ? null : groupOf(tierId);
  return found === null ? null : `${found.group.short}${found.division}`;
};

/**
 * The mean rank of a side, named as the nearest tier.
 *
 * Unranked players are left out rather than counted as zero, which would drag a
 * whole team's average down over one player the API has no rank for. Null when
 * that leaves nothing to average.
 */
export const averageTierName = (tierIds: readonly (number | null)[]): string | null => {
  const ranked = tierIds.filter(
    (tierId): tierId is number => tierId !== null && tierId >= FIRST_RANKED_TIER,
  );

  if (ranked.length === 0) {
    return null;
  }

  const mean = ranked.reduce((total, tierId) => total + tierId, 0) / ranked.length;
  return tierName(Math.round(mean));
};
