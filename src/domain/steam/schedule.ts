import { DEFAULT_TIME_ZONE } from '../time/timezone.ts';

export const nextWeeklyCheck = (now: Temporal.Instant): Temporal.Instant =>
  now.add({ hours: 24 * 7 });

export const nextRetryCheck = (now: Temporal.Instant): Temporal.Instant => now.add({ hours: 1 });

export const releaseDayInstant = (date: Temporal.PlainDate): Temporal.Instant =>
  date.toZonedDateTime({ timeZone: DEFAULT_TIME_ZONE, plainTime: '00:00' }).toInstant();
