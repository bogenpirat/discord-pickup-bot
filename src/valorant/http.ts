import type { components } from './generated/schema.ts';

/**
 * The subset of `Response` the client touches. Declaring it structurally lets a
 * test pass a plain object and keeps the global `fetch` assignable, the same way
 * `FetchLike` works in src/steam/client.ts.
 */
export interface ValorantResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ValorantRequestInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export type ValorantFetch = (url: string, init: ValorantRequestInit) => Promise<ValorantResponse>;

/** One entry of the API's `{ errors: [...] }` failure body. */
export type ApiError = components['schemas']['APIError'];

export type ValorantError =
  /** No API key is configured, so no request was made. */
  | { readonly kind: 'not-configured' }
  /** 401/403 — the key is missing, wrong, or lacks the plan for this endpoint. */
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'not-found' }
  /** Still 429 after every retry. */
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'http'; readonly status: number; readonly errors: readonly ApiError[] }
  /** The request never produced a response: DNS, socket, or the request timeout. */
  | { readonly kind: 'network' }
  /** A response arrived but was not the documented shape. */
  | { readonly kind: 'invalid-response' };

/** Region routing value, e.g. `eu`. Riot calls this the affinity. */
export type Affinity = 'eu' | 'na' | 'ap' | 'kr' | 'latam' | 'br';

export type Platform = 'pc' | 'console';

export type QueryValue = string | number | boolean | undefined;

export type Query = Readonly<Record<string, QueryValue>>;

/** Riot names carry spaces and non-ASCII, so every interpolated segment is encoded. */
export const segment = (value: string | number): string => encodeURIComponent(String(value));

export const queryString = (query: Query | undefined): string => {
  if (query === undefined) {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  const rendered = params.toString();
  return rendered === '' ? '' : `?${rendered}`;
};

/**
 * The query with its unset entries removed, for logging. `queryString` drops them
 * on the way to the wire, so a record that kept them would describe a request
 * that was never made.
 */
export const definedQuery = (query: Query): Readonly<Record<string, string | number | boolean>> =>
  Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as Readonly<
    Record<string, string | number | boolean>
  >;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseApiErrors = (body: unknown): readonly ApiError[] => {
  if (!isRecord(body) || !Array.isArray(body['errors'])) {
    return [];
  }
  return body['errors'].filter((entry): entry is ApiError => isRecord(entry));
};

/**
 * Most endpoints answer `{ status, data }`, but a few (the featured store among
 * them) return the payload at the top level. Unwrapping only when `data` is
 * actually there covers both without a per-endpoint flag that the upstream spec
 * would eventually contradict anyway.
 */
export const unwrapEnvelope = (body: unknown): unknown =>
  isRecord(body) && 'data' in body ? body['data'] : body;
