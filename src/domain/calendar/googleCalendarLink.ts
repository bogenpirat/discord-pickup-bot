const BASE_URL = 'https://calendar.google.com/calendar/render';

const MILLIS_PER_MINUTE = 60_000;

export interface CalendarEvent {
  readonly title: string;
  /** Epoch milliseconds. */
  readonly startsAt: number;
  readonly durationMinutes: number;
  readonly details?: string;
}

/** `20260822T190000Z`, the shape Google expects in the `dates` parameter. */
const formatUtc = (epochMillis: number): string =>
  Temporal.Instant.fromEpochMilliseconds(epochMillis)
    .toString({ smallestUnit: 'second' })
    .replace(/[-:]/g, '');

// Google's own examples spell spaces as `+` rather than `%20`, and both sides of
// the `dates` range stay readable because the separator is left alone.
const encode = (value: string): string => encodeURIComponent(value).replace(/%20/g, '+');

/**
 * Builds a Google Calendar "add event" link. Nothing here is Discord-specific —
 * callers hand in finished text and get a URL back.
 */
export const googleCalendarLink = (event: CalendarEvent): string => {
  const endsAt = event.startsAt + event.durationMinutes * MILLIS_PER_MINUTE;
  const parts = [
    'action=TEMPLATE',
    `text=${encode(event.title)}`,
    `dates=${formatUtc(event.startsAt)}/${formatUtc(endsAt)}`,
  ];

  if (event.details !== undefined) {
    parts.push(`details=${encode(event.details)}`);
  }

  return `${BASE_URL}?${parts.join('&')}`;
};
