import { parseSteamReleaseDate } from './parseReleaseDate.ts';
import { releaseDayInstant } from './schedule.ts';

export type ReleaseClassification =
  | { readonly kind: 'released' }
  | { readonly kind: 'scheduled'; readonly at: Temporal.Instant }
  | { readonly kind: 'pending' };

/**
 * `comingSoon` is the only authoritative signal that a game is out: Steam clears
 * it at the moment the store page goes live. The dates are scheduling hints, and
 * a date that has passed while coming_soon is still set means the release slipped
 * — announcing on the date alone is what made the bot fire ~22h early.
 */
export const classifyRelease = (
  comingSoon: boolean,
  releaseDateText: string,
  releaseAt: Temporal.Instant | null,
): ReleaseClassification => {
  if (!comingSoon) {
    return { kind: 'released' };
  }

  if (releaseAt !== null) {
    return { kind: 'scheduled', at: releaseAt };
  }

  const parsed = parseSteamReleaseDate(releaseDateText);
  if (parsed === null) {
    return { kind: 'pending' };
  }

  return { kind: 'scheduled', at: releaseDayInstant(parsed) };
};
