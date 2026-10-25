import { type JoinLinkResult, parseJoinLinkResponse } from '../domain/wardogs/parseJoinLink.ts';
import {
  type LiveServerDetail,
  parseServerDetailResponse,
  type ServerDetailResult,
} from '../domain/wardogs/parseServerDetail.ts';
import { assembleBanner, type BannerImage, type ImageFetch } from './banner.ts';

export type WardogsLookupResult =
  | ServerDetailResult
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'error' };

export type WardogsJoinResult =
  | JoinLinkResult
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'error' };

export interface WardogsFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface WardogsFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export type WardogsFetch = (url: string, init?: WardogsFetchInit) => Promise<WardogsFetchResponse>;

export interface WardogsClient {
  /** `key` as `parseServerKey` builds it, e.g. `id|<guid>`. */
  getServerDetail(key: string): Promise<WardogsLookupResult>;
  /** The server's own banner over the site's status card, or whichever of them exists. */
  getBanner(detail: LiveServerDetail, now: Temporal.Instant): Promise<BannerImage | null>;
  /** The `steam://joinlobby/…` link that drops a player into the server, asked for fresh. */
  getJoinLink(key: string): Promise<WardogsJoinResult>;
}

const SERVER_DETAIL_URL = 'https://wardogserverlist.com/api/server-detail';
const BANNER_URL = 'https://wardogserverlist.com/banner.jpg';
const SERVER_PAGE_URL = 'https://wardogserverlist.com/server';
const JOIN_URL = 'https://wardogserverlist.com/discord/api/join';
/** The join endpoint answers 403 to any request that does not claim to come from the site. */
const SITE_ORIGIN = 'https://wardogserverlist.com';
const JOIN_TIMEOUT_MS = 5_000;

/**
 * The site itself caches these responses for two minutes, so asking again
 * sooner only spends the public rate limit on the same answer.
 */
const CACHE_TTL_MS = 60_000;

const IMAGE_TIMEOUT_MS = 5_000;
/** Banners seen in the wild are well under 1 MB; anything far past that is not one. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Errors and 429s are left out so the next attempt actually retries. */
const isCacheable = (result: WardogsLookupResult): boolean =>
  result.kind === 'live' || result.kind === 'offline' || result.kind === 'not-found';

export const serverDetailUrl = (key: string): string =>
  `${SERVER_DETAIL_URL}?${new URLSearchParams({ key })}`;

/**
 * The site's rendered status card for a server: map art with name, mode and
 * player count drawn on. `wide` is the 1200×500 cut the site uses for its own
 * Discord cards. The site's CDN caches the card for about five minutes, so
 * `version` changes the URL with each poll to get the card as it is now.
 */
export const bannerUrl = (linkKey: string, version: number): string =>
  `${BANNER_URL}?${new URLSearchParams({ key: linkKey, style: 'wide', v: String(version) })}`;

/** The server's page on the site: join code, live status and player history. */
export const serverPageUrl = (linkKey: string): string =>
  `${SERVER_PAGE_URL}?${new URLSearchParams({ key: linkKey })}`;

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Fetches an image the bot then attaches itself. Downloading it here, rather
 * than handing Discord the URL, sidesteps image hosts that refuse Discord's
 * proxy, which is why server banners never showed as a linked thumbnail.
 */
export const createImageFetch =
  (fetchImpl: WardogsFetch = fetch): ImageFetch =>
  async (url) => {
    if (!isHttpsUrl(url)) {
      return null;
    }
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (!response.ok || declared > MAX_IMAGE_BYTES) {
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length > MAX_IMAGE_BYTES ? null : bytes;
    } catch {
      return null;
    }
  };

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

  const fetchImage = createImageFetch(fetchImpl);

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

  // Not cached: the lobby id changes whenever the server restarts, and a stale
  // one drops the player at an error in-game instead of into the match.
  const join = async (key: string): Promise<WardogsJoinResult> => {
    try {
      const response = await fetchImpl(JOIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: SITE_ORIGIN },
        body: JSON.stringify({ key }),
        signal: AbortSignal.timeout(JOIN_TIMEOUT_MS),
      });
      if (response.status === 404) {
        return { kind: 'not-found' };
      }
      if (response.status === 429) {
        return { kind: 'rate-limited' };
      }
      if (!response.ok) {
        return { kind: 'error' };
      }
      return parseJoinLinkResponse(await response.json());
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

    getBanner: (detail, now) =>
      assembleBanner(
        {
          serverImageUrl: detail.server.imageUrl,
          cardUrl:
            detail.linkKey === null
              ? null
              : // Versioned by the poll the data came from, which is when the card changes.
                bannerUrl(
                  detail.linkKey,
                  Math.floor((detail.updatedAt ?? now).epochMilliseconds / 1000),
                ),
        },
        fetchImage,
      ),

    getJoinLink: join,
  };
};
