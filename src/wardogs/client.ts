import {
  parseServerDetailResponse,
  type ServerDetailResult,
} from '../domain/wardogs/parseServerDetail.ts';
import type { ServerRef } from '../domain/wardogs/serverRef.ts';

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
  getServerDetail(ref: ServerRef): Promise<WardogsLookupResult>;
}

const SERVER_DETAIL_URL = 'https://wardogserverlist.com/api/server-detail';

/**
 * The site itself caches these responses for two minutes, so asking again
 * sooner only spends the public rate limit on the same answer.
 */
const CACHE_TTL_MS = 60_000;

/** Errors and 429s are left out so the next attempt actually retries. */
const isCacheable = (result: WardogsLookupResult): boolean =>
  result.kind === 'live' || result.kind === 'offline' || result.kind === 'not-found';

export const serverDetailUrl = (ref: ServerRef): string =>
  `${SERVER_DETAIL_URL}?${new URLSearchParams({ [ref.param]: ref.value })}`;

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
    getServerDetail: async (ref) => {
      const url = serverDetailUrl(ref);
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
