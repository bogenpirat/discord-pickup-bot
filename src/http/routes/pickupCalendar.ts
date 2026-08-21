import type { PickupRepository } from '../../db/repositories/pickupRepository.ts';
import { icsDocument } from '../../domain/calendar/icsDocument.ts';
import { pickupCalendarEvent, pickupMessageUrl } from '../../ui/calendarEvent.ts';
import { APP_LOCALES, type AppLocale, DEFAULT_LOCALE, stringsFor } from '../../ui/strings.ts';
import { notFound } from '../router.ts';
import type { HttpRoute } from '../types.ts';

export interface PickupCalendarDeps {
  readonly pickups: PickupRepository;
  /** Reads the live guild name; null when the bot is no longer in that guild. */
  readonly guildName: (guildId: string) => string | null;
  /** Public origin of this server, used to keep event UIDs unique per deployment. */
  readonly baseUrl: string;
  readonly now: () => number;
}

export const PICKUP_CALENDAR_PATTERN = /^\/pickup\/calendar\/(\d+)\.ics$/;

const isAppLocale = (value: string): value is AppLocale =>
  (APP_LOCALES as readonly string[]).includes(value);

const localeFrom = (value: string | null): AppLocale =>
  value !== null && isAppLocale(value) ? value : DEFAULT_LOCALE;

const hostOf = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'discord-pickup-bot';
  }
};

/**
 * Serves one pickup as an iCalendar file. The document is rendered per request
 * straight from the database rather than cached, so a start time changed later
 * with `/valo-time` is picked up without the Discord message being re-rendered.
 */
export const pickupCalendarRoute = (deps: PickupCalendarDeps): HttpRoute => {
  const uidHost = hostOf(deps.baseUrl);

  return {
    methods: ['GET', 'HEAD'],
    pattern: PICKUP_CALENDAR_PATTERN,
    handle: (match, request) => {
      const id = Number(match[1]);

      if (!Number.isSafeInteger(id)) {
        return notFound();
      }

      const pickup = deps.pickups.findById(id);

      if (pickup === undefined) {
        return notFound();
      }

      const strings = stringsFor(localeFrom(request.query.get('lang')));
      const event = pickupCalendarEvent(pickup, deps.guildName(pickup.guildId), strings);

      if (event === null) {
        return notFound();
      }

      const messageUrl = pickupMessageUrl(pickup);
      const body = icsDocument(
        {
          ...event,
          uid: `pickup-${id}@${uidHost}`,
          ...(messageUrl === null ? {} : { url: messageUrl }),
        },
        deps.now(),
      );

      return {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="pickup-${id}.ics"`,
          'Content-Length': String(Buffer.byteLength(body, 'utf8')),
          'Cache-Control': 'no-store',
        },
        body,
      };
    },
  };
};
