import { messageLink } from 'discord.js';
import type { PickupRecord } from '../db/repositories/pickupRepository.ts';
import type { CalendarEvent } from '../domain/calendar/googleCalendarLink.ts';
import type { Strings } from './strings.ts';

/** How long a pickup is assumed to run, for want of an end time on the record. */
export const CALENDAR_DURATION_MINUTES = 120;

/** The permalink of the post a pickup lives in, or null before it has one. */
export const pickupMessageUrl = (pickup: PickupRecord): string | null =>
  pickup.messageId === null
    ? null
    : messageLink(pickup.channelId, pickup.messageId, pickup.guildId);

/**
 * The one description of a pickup as a calendar event. Both the Google Calendar
 * link and the served `.ics` file build from this, so the two can never drift
 * into describing different events.
 *
 * Null when the pickup has no discrete start time — there is nothing to put in
 * a `dates` parameter or a `DTSTART`, so there is no event to describe.
 */
export const pickupCalendarEvent = (
  pickup: PickupRecord,
  guildName: string | null,
  strings: Strings,
): CalendarEvent | null => {
  if (pickup.startsAt === null) {
    return null;
  }

  const messageUrl = pickupMessageUrl(pickup);

  // The organiser's own words come first and the permalink last, so a calendar
  // that truncates a long description cuts the boilerplate rather than the note.
  const details = [pickup.note, messageUrl === null ? null : strings.calendarDetails(messageUrl)]
    .filter((part): part is string => part !== null)
    .join('\n\n');

  return {
    title: strings.calendarTitle(guildName),
    startsAt: pickup.startsAt,
    durationMinutes: CALENDAR_DURATION_MINUTES,
    ...(details === '' ? {} : { details }),
  };
};
