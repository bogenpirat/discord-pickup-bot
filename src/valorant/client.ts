import { isRetryable, parseDelaySeconds, retryDelayMs } from '../domain/valorant/backoff.ts';
import type { RateLimiter } from '../lib/rateLimiter.ts';
import { err, ok, type Result } from '../lib/result.ts';
import {
  type Affinity,
  type Platform,
  parseApiErrors,
  type Query,
  queryString,
  segment,
  unwrapEnvelope,
  type ValorantError,
  type ValorantFetch,
  type ValorantResponse,
} from './http.ts';
import type {
  Account,
  Content,
  EsportsSchedule,
  FeaturedStore,
  GameVersion,
  Leaderboard,
  Match,
  MatchMode,
  Mmr,
  MmrHistory,
  PremierTeam,
  PremierTeamHistory,
  PremierTeamSummary,
  QueueStatus,
  RawPayload,
  RawResult,
  ServerStatus,
  StoredMatch,
  StoredMmr,
  StoreOffers,
  VlrEvent,
  VlrEventMatch,
  VlrEventType,
  VlrMatch,
  VlrPlayer,
  VlrPlayerMatch,
  VlrPlayerTimespan,
  VlrTeam,
  VlrTeamMatch,
  VlrTeamTransaction,
  WebhookDeleteResult,
  WebhookUserAdd,
  WebhookUserMutation,
  WebhookUserUpdate,
  WebsiteArticle,
  WebsiteEntry,
} from './types.ts';

const BASE_URL = 'https://api.henrikdev.xyz';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

export type ValorantResult<T> = Result<T, ValorantError>;

export interface ValorantStats {
  /** Requests admitted in the trailing rate-limit window. */
  readonly used: number;
  readonly limit: number;
  readonly waiting: number;
  readonly blockedUntil: number | null;
  readonly requests: number;
  readonly failures: number;
  readonly rateLimitHits: number;
  readonly lastRateLimitedAt: number | null;
}

export interface ValorantClientOptions {
  readonly apiKey: string;
  readonly limiter: RateLimiter;
  readonly fetchImpl?: ValorantFetch;
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface MatchQuery {
  readonly mode?: MatchMode | undefined;
  readonly map?: string | undefined;
  readonly size?: number | undefined;
  readonly start?: number | undefined;
}

export interface StoredMatchQuery {
  readonly mode?: MatchMode | undefined;
  readonly map?: string | undefined;
  readonly size?: number | undefined;
}

export interface LeaderboardQuery {
  readonly season?: string | undefined;
  readonly size?: number | undefined;
  readonly page?: number | undefined;
  readonly name?: string | undefined;
  readonly tag?: string | undefined;
}

export interface PremierSearchQuery {
  readonly name?: string | undefined;
  readonly tag?: string | undefined;
  readonly id?: string | undefined;
  readonly season?: string | undefined;
}

export interface PremierLeaderboardQuery {
  readonly conference?: string | undefined;
  readonly division?: string | undefined;
  readonly season?: string | undefined;
}

export interface PremierTeamQuery {
  readonly season?: string | undefined;
  readonly affinity?: Affinity | undefined;
}

export interface VlrEventsQuery {
  readonly region?: string | undefined;
  readonly type?: VlrEventType | undefined;
  readonly page?: number | undefined;
}

/**
 * Every method returns the endpoint's `data` payload, already unwrapped from the
 * `{ status, data }` envelope. Each is one HTTP call, admitted by the shared rate
 * limiter and retried on 429 or 5xx.
 */
export interface ValorantClient {
  // Account
  getAccount(
    name: string,
    tag: string,
    query?: { force?: boolean | undefined },
  ): Promise<ValorantResult<Account>>;
  getAccountByPuuid(
    puuid: string,
    query?: { force?: boolean | undefined },
  ): Promise<ValorantResult<Account>>;

  // Rank
  getMmr(
    affinity: Affinity,
    platform: Platform,
    name: string,
    tag: string,
  ): Promise<ValorantResult<Mmr>>;
  getMmrByPuuid(
    affinity: Affinity,
    platform: Platform,
    puuid: string,
  ): Promise<ValorantResult<Mmr>>;
  getMmrHistory(
    affinity: Affinity,
    platform: Platform,
    name: string,
    tag: string,
  ): Promise<ValorantResult<MmrHistory>>;
  getMmrHistoryByPuuid(
    affinity: Affinity,
    platform: Platform,
    puuid: string,
  ): Promise<ValorantResult<MmrHistory>>;

  // Matches
  getMatches(
    affinity: Affinity,
    platform: Platform,
    name: string,
    tag: string,
    query?: MatchQuery,
  ): Promise<ValorantResult<readonly Match[]>>;
  getMatchesByPuuid(
    affinity: Affinity,
    platform: Platform,
    puuid: string,
    query?: MatchQuery,
  ): Promise<ValorantResult<readonly Match[]>>;
  getMatch(affinity: Affinity, matchId: string): Promise<ValorantResult<Match>>;

  // Stored: HenrikDev's own archive, which does not spend a Riot request
  getStoredMatches(
    affinity: Affinity,
    name: string,
    tag: string,
    query?: StoredMatchQuery,
  ): Promise<ValorantResult<readonly StoredMatch[]>>;
  getStoredMatchesByPuuid(
    affinity: Affinity,
    puuid: string,
    query?: StoredMatchQuery,
  ): Promise<ValorantResult<readonly StoredMatch[]>>;
  getStoredMmrHistory(
    affinity: Affinity,
    platform: Platform,
    name: string,
    tag: string,
    query?: { size?: number | undefined },
  ): Promise<ValorantResult<readonly StoredMmr[]>>;
  getStoredMmrHistoryByPuuid(
    affinity: Affinity,
    platform: Platform,
    puuid: string,
    query?: { size?: number | undefined },
  ): Promise<ValorantResult<readonly StoredMmr[]>>;

  // Leaderboard
  getLeaderboard(
    affinity: Affinity,
    platform: Platform,
    query?: LeaderboardQuery,
  ): Promise<ValorantResult<Leaderboard>>;

  // Premier
  searchPremierTeams(
    query?: PremierSearchQuery,
  ): Promise<ValorantResult<readonly PremierTeamSummary[]>>;
  getPremierLeaderboard(
    affinity: Affinity,
    query?: PremierLeaderboardQuery,
  ): Promise<ValorantResult<readonly PremierTeamSummary[]>>;
  getPremierTeam(
    name: string,
    tag: string,
    query?: PremierTeamQuery,
  ): Promise<ValorantResult<PremierTeam>>;
  getPremierTeamById(id: string, query?: PremierTeamQuery): Promise<ValorantResult<PremierTeam>>;
  getPremierTeamHistory(
    name: string,
    tag: string,
    query?: { season?: string | undefined },
  ): Promise<ValorantResult<PremierTeamHistory>>;
  getPremierTeamHistoryById(
    id: string,
    query?: { season?: string | undefined },
  ): Promise<ValorantResult<PremierTeam>>;

  // Esports
  getEsportsSchedule(query?: {
    region?: string | undefined;
    league?: string | undefined;
  }): Promise<ValorantResult<readonly EsportsSchedule[]>>;
  getVlrEvents(query?: VlrEventsQuery): Promise<ValorantResult<readonly VlrEvent[]>>;
  getVlrEventMatches(eventId: number): Promise<ValorantResult<readonly VlrEventMatch[]>>;
  getVlrMatch(matchId: string): Promise<ValorantResult<VlrMatch>>;
  getVlrTeam(teamId: number): Promise<ValorantResult<VlrTeam>>;
  getVlrTeamMatches(
    teamId: number,
    query?: { page?: number | undefined },
  ): Promise<ValorantResult<readonly VlrTeamMatch[]>>;
  getVlrTeamTransactions(teamId: number): Promise<ValorantResult<readonly VlrTeamTransaction[]>>;
  getVlrPlayer(
    playerId: number,
    query?: { timespan?: VlrPlayerTimespan | undefined },
  ): Promise<ValorantResult<VlrPlayer>>;
  getVlrPlayerMatches(
    playerId: number,
    query?: { page?: number | undefined },
  ): Promise<ValorantResult<readonly VlrPlayerMatch[]>>;

  // Content and store
  getContent(query?: { locale?: string | undefined }): Promise<ValorantResult<Content>>;
  getFeaturedStore(): Promise<ValorantResult<FeaturedStore>>;
  getStoreOffers(): Promise<ValorantResult<StoreOffers>>;

  // Service status and misc
  getStatus(affinity: Affinity): Promise<ValorantResult<ServerStatus>>;
  getQueueStatus(affinity: Affinity): Promise<ValorantResult<readonly QueueStatus[]>>;
  getVersion(affinity: Affinity): Promise<ValorantResult<GameVersion>>;
  getWebsite(
    countryCode: string,
    query?: { category?: string | undefined },
  ): Promise<ValorantResult<readonly WebsiteArticle[]>>;
  getWebsiteEntry(countryCode: string, dbId: string): Promise<ValorantResult<WebsiteEntry>>;
  /** Answers `image/png`, so this one hands back the raw bytes. */
  generateCrosshair(query?: { id?: string | undefined }): Promise<ValorantResult<Uint8Array>>;
  postRaw(payload: RawPayload): Promise<ValorantResult<RawResult>>;

  // Premium webhooks. The upstream spec documents no success body for the two
  // below, so they stay `unknown` rather than inventing a shape for them.
  getWebhookSettings(): Promise<ValorantResult<unknown>>;
  addWebhookUser(payload: WebhookUserAdd): Promise<ValorantResult<WebhookUserMutation>>;
  updateWebhookUser(id: string, payload: WebhookUserUpdate): Promise<ValorantResult<unknown>>;
  deleteWebhookUser(id: string): Promise<ValorantResult<WebhookDeleteResult>>;

  stats(): ValorantStats;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface RequestSpec {
  readonly method: string;
  readonly path: string;
  readonly query?: Query | undefined;
  readonly body?: unknown | undefined;
}

/** How one attempt ended, before the retry loop decides what to do about it. */
type Attempt<T> =
  | { readonly outcome: 'done'; readonly result: ValorantResult<T> }
  | {
      readonly outcome: 'retry';
      readonly status: number;
      readonly response: ValorantResponse | null;
    };

type ReadResponse<T> = (response: ValorantResponse) => Promise<ValorantResult<T>>;

export const createValorantClient = (options: ValorantClientOptions): ValorantClient => {
  const { apiKey, limiter } = options;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as ValorantFetch);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  let requests = 0;
  let failures = 0;
  let rateLimitHits = 0;
  let lastRateLimitedAt: number | null = null;

  const send = async (spec: RequestSpec): Promise<ValorantResponse> => {
    await limiter.acquire();
    requests += 1;

    const headers: Record<string, string> = {
      // HenrikDev takes the bare key here; there is no `Bearer` prefix.
      Authorization: apiKey,
      Accept: 'application/json',
    };

    if (spec.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    return fetchImpl(`${BASE_URL}${spec.path}${queryString(spec.query)}`, {
      method: spec.method,
      headers,
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  /** Maps a non-retryable failure onto the error union, reading the body for details. */
  const toError = async (response: ValorantResponse): Promise<ValorantError> => {
    if (response.status === 401 || response.status === 403) {
      return { kind: 'unauthorized' };
    }
    if (response.status === 404) {
      return { kind: 'not-found' };
    }
    const body = await response.json().catch(() => undefined);
    return { kind: 'http', status: response.status, errors: parseApiErrors(body) };
  };

  const runAttempt = async <T>(spec: RequestSpec, read: ReadResponse<T>): Promise<Attempt<T>> => {
    let response: ValorantResponse;
    try {
      response = await send(spec);
    } catch {
      // No response at all: DNS, socket, or the request timeout fired.
      return { outcome: 'retry', status: 0, response: null };
    }

    if (response.ok) {
      return { outcome: 'done', result: await read(response) };
    }
    if (isRetryable(response.status)) {
      return { outcome: 'retry', status: response.status, response };
    }
    return { outcome: 'done', result: err(await toError(response)) };
  };

  const execute = async <T>(
    spec: RequestSpec,
    read: ReadResponse<T>,
  ): Promise<ValorantResult<T>> => {
    let lastStatus = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const step = await runAttempt(spec, read);

      if (step.outcome === 'done') {
        if (!step.result.ok) {
          failures += 1;
        }
        return step.result;
      }

      lastStatus = step.status;
      const headers = step.response?.headers;
      const delay = retryDelayMs({
        attempt,
        retryAfterSeconds: parseDelaySeconds(headers?.get('retry-after') ?? null),
        resetSeconds: parseDelaySeconds(headers?.get('x-ratelimit-reset') ?? null),
      });

      if (step.status === 429) {
        rateLimitHits += 1;
        lastRateLimitedAt = now();
        // Hold the whole queue back rather than just this caller: the siblings
        // already waiting would otherwise walk straight into the same 429.
        limiter.penalizeUntil(now() + delay);
      }

      if (attempt === maxRetries) {
        break;
      }

      await sleep(delay);
    }

    failures += 1;
    return err(lastStatus === 429 ? { kind: 'rate-limited' } : { kind: 'network' });
  };

  const readJson = async <T>(response: ValorantResponse): Promise<ValorantResult<T>> => {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return err({ kind: 'invalid-response' });
    }

    const data = unwrapEnvelope(body);
    return data === undefined || data === null ? err({ kind: 'invalid-response' }) : ok(data as T);
  };

  const readBytes = async (response: ValorantResponse): Promise<ValorantResult<Uint8Array>> => {
    try {
      return ok(new Uint8Array(await response.arrayBuffer()));
    } catch {
      return err({ kind: 'invalid-response' });
    }
  };

  const get = <T>(path: string, query?: Query): Promise<ValorantResult<T>> =>
    execute<T>({ method: 'GET', path, ...(query === undefined ? {} : { query }) }, readJson);

  const withBody = <T>(method: string, path: string, body: unknown): Promise<ValorantResult<T>> =>
    execute<T>({ method, path, body }, readJson);

  return {
    getAccount: (name, tag, query) =>
      get(`/valorant/v2/account/${segment(name)}/${segment(tag)}`, { force: query?.force }),
    getAccountByPuuid: (puuid, query) =>
      get(`/valorant/v2/by-puuid/account/${segment(puuid)}`, { force: query?.force }),

    getMmr: (affinity, platform, name, tag) =>
      get(
        `/valorant/v3/mmr/${segment(affinity)}/${segment(platform)}/${segment(name)}/${segment(tag)}`,
      ),
    getMmrByPuuid: (affinity, platform, puuid) =>
      get(`/valorant/v3/by-puuid/mmr/${segment(affinity)}/${segment(platform)}/${segment(puuid)}`),
    getMmrHistory: (affinity, platform, name, tag) =>
      get(
        `/valorant/v2/mmr-history/${segment(affinity)}/${segment(platform)}/${segment(name)}/${segment(tag)}`,
      ),
    getMmrHistoryByPuuid: (affinity, platform, puuid) =>
      get(
        `/valorant/v2/by-puuid/mmr-history/${segment(affinity)}/${segment(platform)}/${segment(puuid)}`,
      ),

    getMatches: (affinity, platform, name, tag, query) =>
      get(
        `/valorant/v4/matches/${segment(affinity)}/${segment(platform)}/${segment(name)}/${segment(tag)}`,
        { mode: query?.mode, map: query?.map, size: query?.size, start: query?.start },
      ),
    getMatchesByPuuid: (affinity, platform, puuid, query) =>
      get(
        `/valorant/v4/by-puuid/matches/${segment(affinity)}/${segment(platform)}/${segment(puuid)}`,
        { mode: query?.mode, map: query?.map, size: query?.size, start: query?.start },
      ),
    getMatch: (affinity, matchId) =>
      get(`/valorant/v4/match/${segment(affinity)}/${segment(matchId)}`),

    getStoredMatches: (affinity, name, tag, query) =>
      get(`/valorant/v1/stored-matches/${segment(affinity)}/${segment(name)}/${segment(tag)}`, {
        mode: query?.mode,
        map: query?.map,
        size: query?.size,
      }),
    getStoredMatchesByPuuid: (affinity, puuid, query) =>
      get(`/valorant/v1/by-puuid/stored-matches/${segment(affinity)}/${segment(puuid)}`, {
        mode: query?.mode,
        map: query?.map,
        size: query?.size,
      }),
    getStoredMmrHistory: (affinity, platform, name, tag, query) =>
      get(
        `/valorant/v2/stored-mmr-history/${segment(affinity)}/${segment(platform)}/${segment(name)}/${segment(tag)}`,
        { size: query?.size },
      ),
    getStoredMmrHistoryByPuuid: (affinity, platform, puuid, query) =>
      get(
        `/valorant/v2/by-puuid/stored-mmr-history/${segment(affinity)}/${segment(platform)}/${segment(puuid)}`,
        { size: query?.size },
      ),

    getLeaderboard: (affinity, platform, query) =>
      get(`/valorant/v3/leaderboard/${segment(affinity)}/${segment(platform)}`, {
        season: query?.season,
        size: query?.size,
        page: query?.page,
        name: query?.name,
        tag: query?.tag,
      }),

    searchPremierTeams: (query) =>
      get('/valorant/v1/premier/search', {
        name: query?.name,
        tag: query?.tag,
        id: query?.id,
        season: query?.season,
      }),
    getPremierLeaderboard: (affinity, query) =>
      get(`/valorant/v1/premier/leaderboard/${segment(affinity)}`, {
        conference: query?.conference,
        division: query?.division,
        season: query?.season,
      }),
    getPremierTeam: (name, tag, query) =>
      get(`/valorant/v1/premier/${segment(name)}/${segment(tag)}`, {
        season: query?.season,
        affinity: query?.affinity,
      }),
    getPremierTeamById: (id, query) =>
      get(`/valorant/v1/premier/${segment(id)}`, {
        season: query?.season,
        affinity: query?.affinity,
      }),
    getPremierTeamHistory: (name, tag, query) =>
      get(`/valorant/v1/premier/${segment(name)}/${segment(tag)}/history`, {
        season: query?.season,
      }),
    getPremierTeamHistoryById: (id, query) =>
      get(`/valorant/v1/premier/${segment(id)}/history`, { season: query?.season }),

    getEsportsSchedule: (query) =>
      get('/valorant/v1/esports/schedule', { region: query?.region, league: query?.league }),
    getVlrEvents: (query) =>
      get('/valorant/v2/esports/vlr/events', {
        region: query?.region,
        type: query?.type,
        page: query?.page,
      }),
    getVlrEventMatches: (eventId) =>
      get(`/valorant/v2/esports/vlr/events/${segment(eventId)}/matches`),
    getVlrMatch: (matchId) => get(`/valorant/v2/esports/vlr/matches/${segment(matchId)}`),
    getVlrTeam: (teamId) => get(`/valorant/v2/esports/vlr/teams/${segment(teamId)}`),
    getVlrTeamMatches: (teamId, query) =>
      get(`/valorant/v2/esports/vlr/teams/${segment(teamId)}/matches`, { page: query?.page }),
    getVlrTeamTransactions: (teamId) =>
      get(`/valorant/v2/esports/vlr/teams/${segment(teamId)}/transactions`),
    getVlrPlayer: (playerId, query) =>
      get(`/valorant/v2/esports/vlr/players/${segment(playerId)}`, { timespan: query?.timespan }),
    getVlrPlayerMatches: (playerId, query) =>
      get(`/valorant/v2/esports/vlr/players/${segment(playerId)}/matches`, { page: query?.page }),

    getContent: (query) => get('/valorant/v1/content', { locale: query?.locale }),
    getFeaturedStore: () => get('/valorant/v2/store-featured'),
    getStoreOffers: () => get('/valorant/v2/store-offers'),

    getStatus: (affinity) => get(`/valorant/v1/status/${segment(affinity)}`),
    getQueueStatus: (affinity) => get(`/valorant/v1/queue-status/${segment(affinity)}`),
    getVersion: (affinity) => get(`/valorant/v1/version/${segment(affinity)}`),
    getWebsite: (countryCode, query) =>
      get(`/valorant/v1/website/${segment(countryCode)}`, { category: query?.category }),
    getWebsiteEntry: (countryCode, dbId) =>
      get(`/valorant/v1/website/${segment(countryCode)}/${segment(dbId)}`),
    generateCrosshair: (query) =>
      execute<Uint8Array>(
        { method: 'GET', path: '/valorant/v1/crosshair/generate', query: { id: query?.id } },
        readBytes,
      ),
    postRaw: (payload) => withBody('POST', '/valorant/v1/raw', payload),

    getWebhookSettings: () => get('/public/v1/premium/webhook'),
    addWebhookUser: (payload) => withBody('POST', '/public/v1/premium/webhook/users', payload),
    updateWebhookUser: (id, payload) =>
      withBody('PUT', `/public/v1/premium/webhook/users/${segment(id)}`, payload),
    deleteWebhookUser: (id) =>
      execute<WebhookDeleteResult>(
        { method: 'DELETE', path: `/public/v1/premium/webhook/users/${segment(id)}` },
        readJson,
      ),

    stats: () => {
      const state = limiter.state();
      return {
        used: state.used,
        limit: state.limit,
        waiting: state.waiting,
        blockedUntil: state.blockedUntil,
        requests,
        failures,
        rateLimitHits,
        lastRateLimitedAt,
      };
    },
  };
};
