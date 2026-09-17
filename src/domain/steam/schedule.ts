import type { ReleaseClassification } from './classifyRelease.ts';

/**
 * Steam renders the release day of the appdetails API in its own timezone, so
 * "18 Sep, 2026" means the Pacific day, not the viewer's local one.
 */
const STEAM_TIME_ZONE = 'America/Los_Angeles';

/** After this long without coming_soon flipping, treat the date as slipped and back off. */
const STALE_RELEASE_DAYS = 7;

export const nextWeeklyCheck = (now: Temporal.Instant): Temporal.Instant =>
  now.add({ hours: 24 * 7 });

export const nextRetryCheck = (now: Temporal.Instant): Temporal.Instant => now.add({ hours: 1 });

/**
 * Start of the release day in Steam's timezone. Used only when the exact release
 * instant is unavailable: the game may ship any time during that day, so this is
 * the earliest moment it is worth looking.
 */
export const releaseDayInstant = (date: Temporal.PlainDate): Temporal.Instant =>
  date.toZonedDateTime({ timeZone: STEAM_TIME_ZONE, plainTime: '00:00' }).toInstant();

/**
 * When to look at a game again. A known release instant that has not arrived yet
 * is the obvious moment; once it passes without Steam clearing coming_soon the
 * release has slipped, so fall back to polling rather than announcing early.
 */
export const nextCheckFor = (
  classification: ReleaseClassification,
  now: Temporal.Instant,
): Temporal.Instant => {
  if (classification.kind !== 'scheduled') {
    return nextWeeklyCheck(now);
  }

  if (Temporal.Instant.compare(classification.at, now) > 0) {
    return classification.at;
  }

  const staleSince = classification.at.add({ hours: 24 * STALE_RELEASE_DAYS });
  return Temporal.Instant.compare(now, staleSince) >= 0
    ? nextWeeklyCheck(now)
    : nextRetryCheck(now);
};
