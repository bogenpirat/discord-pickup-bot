import type { PickupMovie } from '../db/repositories/pickupRepository.ts';
import { findMovieLink } from '../domain/movies/findMovieLink.ts';
import type { PickupTheme } from '../domain/pickupTheme.ts';
import { extractStartTime } from '../domain/time/extract.ts';
import type { TmdbClient } from '../tmdb/client.ts';
import { type AppLocale, DEFAULT_LOCALE } from '../ui/strings.ts';

/** What a pickup call's free text turned out to say. */
export interface PickupInfo {
  readonly startsAt: Temporal.ZonedDateTime | null;
  /** The text shown on the message, or null when nothing is left to show. */
  readonly note: string | null;
  readonly movie: PickupMovie | null;
  /** A film was linked but could not be looked up, so the text stays as written. */
  readonly movieNotFound: boolean;
}

/** The poster is rendered for the whole channel in one language, so the plot is fetched in it too. */
const TMDB_LANGUAGES: Readonly<Record<AppLocale, string>> = { de: 'de-DE', en: 'en-US' };

/** Leftovers of a phrase like "Dune — 20 Uhr" once the film and the time are gone. */
const EDGE_SEPARATORS = /^[\s,;:|·/–—-]+|[\s,;:|·/–—-]+$/g;

const orNull = (text: string): string | null => (text === '' ? null : text);

/**
 * Reads a pickup call's text. A movie night that links a film on TMDB or IMDb
 * gets the film looked up, and the link and the time are taken out of the
 * text, since the poster shows both on their own. Every other call keeps the
 * text exactly as written.
 */
export const readPickupInfo = async (
  info: string,
  theme: PickupTheme,
  timeZone: string,
  now: Temporal.Instant,
  movies: TmdbClient | null,
): Promise<PickupInfo> => {
  const link = theme === 'cinema' ? findMovieLink(info) : null;
  // The time is looked for without the link, so nothing inside a URL can be
  // mistaken for one.
  const extracted = extractStartTime(link?.remainder ?? info, timeZone, now);

  if (link === null || movies === null) {
    return { startsAt: extracted.startsAt, note: orNull(info), movie: null, movieNotFound: false };
  }

  const details = await movies.lookup(link.ref, TMDB_LANGUAGES[DEFAULT_LOCALE]);
  if (details === null) {
    return { startsAt: extracted.startsAt, note: orNull(info), movie: null, movieNotFound: true };
  }

  return {
    startsAt: extracted.startsAt,
    note: orNull(extracted.remainder.replace(EDGE_SEPARATORS, '')),
    movie: { ...details, url: link.url },
    movieNotFound: false,
  };
};
