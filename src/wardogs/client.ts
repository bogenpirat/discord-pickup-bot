import {
  parseServerDetailResponse,
  type ServerDetailResult,
} from '../domain/wardogs/parseServerDetail.ts';

export type WardogsLookupResult =
  | ServerDetailResult
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'error' };

export interface WardogsFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type WardogsFetch = (url: string) => Promise<WardogsFetchResponse>;

export interface WardogsClient {
  /** `key` as `parseServerKey` builds it, e.g. `id|<guid>`. */
  getServerDetail(key: string): Promise<WardogsLookupResult>;
}

const SERVER_DETAIL_URL = 'https://wardogserverlist.com/api/server-detail';
const BANNER_URL = 'https://wardogserverlist.com/banner.jpg';
const SERVER_PAGE_URL = 'https://wardogserverlist.com/server';

/**
 * The site itself caches these responses for two minutes, so asking again
 * sooner only spends the public rate limit on the same answer.
 */
const CACHE_TTL_MS = 60_000;

/** Errors and 429s are left out so the next attempt actually retries. */
const isCacheable = (result: WardogsLookupResult): boolean =>
  result.kind === 'live' || result.kind === 'offline' || result.kind === 'not-found';

export const serverDetailUrl = (key: string): string =>
  `${SERVER_DETAIL_URL}?${new URLSearchParams({ key })}`;

/**
 * The site's rendered status card for a server: map art with name, mode and
 * player count drawn on. `wide` is the 1200×500 cut the site uses for its own
 * Discord cards. Discord caches images by URL, so `version` has to change for a
 * later post to show the card as it is now rather than as it was first fetched.
 */
export const bannerUrl = (linkKey: string, version: number): string =>
  `${BANNER_URL}?${new URLSearchParams({ key: linkKey, style: 'wide', v: String(version) })}`;

/** The server's page on the site: join code, live status and player history. */
export const serverPageUrl = (linkKey: string): string =>
  `${SERVER_PAGE_URL}?${new URLSearchParams({ key: linkKey })}`;

export const createWardogsClient = (
  fetchImpl: WardogsFetch = fetch,
  now: () => number = Date.now,
): WardogsClient => {
  const cache = new Map<
    string,
    { readonly result: WardogsLookupResult; readonly expiresAt: number }
  >();

  const sweep = (at: number): void => {
    for (const [url, entry] of cache) {
      if (entry.expiresAt <= at) {
        cache.delete(url);
      }
    }
  };

  const lookup = async (url: string): Promise<WardogsLookupResult> => {
    try {
      const response = await fetchImpl(url);
      if (response.status === 404) {
        return { kind: 'not-found' };
      }
      if (response.status === 429) {
        return { kind: 'rate-limited' };
      }
      if (!response.ok) {
        return { kind: 'error' };
      }
      return parseServerDetailResponse(await response.json());
    } catch {
      return { kind: 'error' };
    }
  };

  return {
    getServerDetail: async (key) => {
      const url = serverDetailUrl(key);
      const cached = cache.get(url);
      if (cached !== undefined && cached.expiresAt > now()) {
        return cached.result;
      }

      const result = await lookup(url);
      // Swept on write so ids looked up once do not pile up for the whole run.
      sweep(now());
      if (isCacheable(result)) {
        cache.set(url, { result, expiresAt: now() + CACHE_TTL_MS });
      }
      return result;
    },
  };
};
