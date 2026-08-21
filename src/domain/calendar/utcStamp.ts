/**
 * `20260822T190000Z` — the basic-format UTC timestamp both the Google Calendar
 * `dates` parameter and RFC 5545's DATE-TIME property expect.
 */
export const utcStamp = (epochMillis: number): string =>
  Temporal.Instant.fromEpochMilliseconds(epochMillis)
    .toString({ smallestUnit: 'second' })
    .replace(/[-:]/g, '');
