import type { MovieRef } from '../domain/movies/findMovieLink.ts';
import { type MovieDetails, parseTmdbFind, parseTmdbTitle } from '../domain/movies/parseTmdb.ts';

export interface TmdbFetchResponse {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type TmdbFetch = (
  url: string,
  init?: { readonly headers?: Readonly<Record<string, string>>; readonly signal?: AbortSignal },
) => Promise<TmdbFetchResponse>;

export interface TmdbClient {
  /**
   * The title, year, plot and poster of a film or series, with the text in
   * the given language where TMDB has it. Null when the title cannot be found
   * or TMDB does not answer.
   */
  lookup(ref: MovieRef, language: string): Promise<MovieDetails | null>;
}

const API_BASE_URL = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 5_000;
/** TMDB has an English plot for nearly everything, so it stands in for a missing translation. */
const FALLBACK_LANGUAGE = 'en-US';

/**
 * TMDB hands out two credentials on the same page: a short v3 API key, sent as
 * a query parameter, and a long v4 read access token, sent as a bearer token.
 * The token is a JWT, so a dot tells the two apart and either one works.
 */
const authFor = (
  apiKey: string,
): { readonly params: Record<string, string>; readonly headers: Record<string, string> } =>
  apiKey.includes('.')
    ? { params: {}, headers: { Authorization: `Bearer ${apiKey}` } }
    : { params: { api_key: apiKey }, headers: {} };

export const createTmdbClient = (apiKey: string, fetchImpl: TmdbFetch = fetch): TmdbClient => {
  const auth = authFor(apiKey);

  const get = async (path: string, params: Record<string, string>): Promise<unknown> => {
    try {
      const query = new URLSearchParams({ ...params, ...auth.params });
      const response = await fetchImpl(`${API_BASE_URL}${path}?${query}`, {
        headers: { Accept: 'application/json', ...auth.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };

  const resolve = async (
    ref: MovieRef,
  ): Promise<{ readonly kind: 'movie' | 'tv'; readonly id: number } | null> =>
    ref.source === 'tmdb'
      ? { kind: ref.kind, id: ref.id }
      : parseTmdbFind(await get(`/find/${ref.id}`, { external_source: 'imdb_id' }));

  return {
    lookup: async (ref, language) => {
      const title = await resolve(ref);
      if (title === null) {
        return null;
      }

      const path = `/${title.kind}/${title.id}`;
      const details = parseTmdbTitle(await get(path, { language }));
      if (details === null || details.overview !== null || language === FALLBACK_LANGUAGE) {
        return details;
      }

      const fallback = parseTmdbTitle(await get(path, { language: FALLBACK_LANGUAGE }));
      return { ...details, overview: fallback?.overview ?? null };
    },
  };
};
