import { describe, expect, it } from 'vitest';
import type { AuditApiCall } from '../../src/audit/types.ts';
import { createRateLimiter, type RateLimiter } from '../../src/lib/rateLimiter.ts';
import { createValorantClient, type ValorantClient } from '../../src/valorant/client.ts';
import type {
  ValorantFetch,
  ValorantRequestInit,
  ValorantResponse,
} from '../../src/valorant/http.ts';

interface StubResponse {
  readonly status?: number;
  readonly json?: unknown;
  readonly bytes?: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  /** Set to throw from `fetch` itself, standing in for a socket or timeout failure. */
  readonly networkError?: boolean;
  /** Set to make the body unparseable. */
  readonly badBody?: boolean;
}

interface Recorded {
  readonly url: string;
  readonly init: ValorantRequestInit;
}

const toResponse = (stub: StubResponse): ValorantResponse => {
  const status = stub.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => stub.headers?.[name.toLowerCase()] ?? null },
    json: async () => {
      if (stub.badBody === true) {
        throw new Error('not json');
      }
      return stub.json;
    },
    arrayBuffer: async () => {
      if (stub.badBody === true) {
        throw new Error('no body');
      }
      return (stub.bytes ?? new Uint8Array()).buffer as ArrayBuffer;
    },
  };
};

/** Replays the given responses in order, repeating the last one once exhausted. */
const stubFetch = (responses: readonly StubResponse[]) => {
  const calls: Recorded[] = [];
  let index = 0;

  const fetchImpl: ValorantFetch = async (url, init) => {
    calls.push({ url, init });
    const stub = responses[Math.min(index, responses.length - 1)] ?? {};
    index += 1;
    if (stub.networkError === true) {
      throw new Error('socket hang up');
    }
    return toResponse(stub);
  };

  return { fetchImpl, calls };
};

const okBody = (data: unknown): StubResponse => ({ json: { status: 200, data } });

interface Harness {
  readonly client: ValorantClient;
  readonly calls: Recorded[];
  readonly slept: number[];
  readonly limiter: RateLimiter;
  /** What the client reported for the audit trail, one per logical request. */
  readonly requests: AuditApiCall[];
}

const START = 5_000;

const harness = (responses: readonly StubResponse[], maxRetries = 3): Harness => {
  const { fetchImpl, calls } = stubFetch(responses);
  const slept: number[] = [];

  // One clock for both the limiter and the client, advanced by whatever they
  // sleep. A frozen clock would leave the limiter spinning on a 429 penalty it
  // could never outlive.
  let clock = START;
  const limiter = createRateLimiter({
    limit: 30,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });

  const requests: AuditApiCall[] = [];

  const client = createValorantClient({
    apiKey: 'HDEV-test-key',
    limiter,
    fetchImpl,
    maxRetries,
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
    onRequest: (call) => {
      requests.push(call);
    },
  });

  return { client, calls, slept, limiter, requests };
};

describe('createValorantClient', () => {
  it('sends the bare key in the Authorization header', async () => {
    const { client, calls } = harness([okBody({ puuid: 'p' })]);

    await client.getAccount('Name', 'EUW');

    expect(calls[0]?.init.headers['Authorization']).toBe('HDEV-test-key');
    expect(calls[0]?.init.headers['Accept']).toBe('application/json');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('unwraps the status/data envelope', async () => {
    const { client } = harness([okBody({ puuid: 'puuid-1', name: 'Name', tag: 'EUW' })]);

    const result = await client.getAccount('Name', 'EUW');

    expect(result).toEqual({ ok: true, value: { puuid: 'puuid-1', name: 'Name', tag: 'EUW' } });
  });

  it('returns a top-level body that carries no envelope', async () => {
    const { client } = harness([{ json: { FeaturedBundle: { bundle: null } } }]);

    const result = await client.getFeaturedStore();

    expect(result).toEqual({ ok: true, value: { FeaturedBundle: { bundle: null } } });
  });

  it('encodes path segments so names with spaces survive', async () => {
    const { client, calls } = harness([okBody({})]);

    await client.getAccount('Some Name', 'EU W');

    expect(calls[0]?.url).toBe('https://api.henrikdev.xyz/valorant/v2/account/Some%20Name/EU%20W');
  });

  it('omits query parameters that were not given', async () => {
    const { client, calls } = harness([okBody([])]);

    await client.getMatches('eu', 'pc', 'Name', 'EUW', { size: 5 });

    expect(calls[0]?.url).toBe(
      'https://api.henrikdev.xyz/valorant/v4/matches/eu/pc/Name/EUW?size=5',
    );
  });

  it('sends no query string at all when every option is absent', async () => {
    const { client, calls } = harness([okBody({})]);

    await client.getMatch('eu', 'match-1');

    expect(calls[0]?.url).toBe('https://api.henrikdev.xyz/valorant/v4/match/eu/match-1');
  });

  it('serialises a request body and marks its content type', async () => {
    const { client, calls } = harness([okBody({})]);

    await client.postRaw({ type: 'matchdetails', value: 'match-1', region: 'eu' });

    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0]?.init.body ?? '')).toEqual({
      type: 'matchdetails',
      value: 'match-1',
      region: 'eu',
    });
  });

  it('reports an unauthorized key', async () => {
    const { client } = harness([{ status: 401 }]);

    expect(await client.getVersion('eu')).toEqual({ ok: false, error: { kind: 'unauthorized' } });
  });

  it('treats a premium-only 403 as unauthorized too', async () => {
    const { client } = harness([{ status: 403 }]);

    expect(await client.getWebhookSettings()).toEqual({
      ok: false,
      error: { kind: 'unauthorized' },
    });
  });

  it('reports an unknown riot id as not found', async () => {
    const { client } = harness([{ status: 404 }]);

    expect(await client.getAccount('Nobody', 'XXX')).toEqual({
      ok: false,
      error: { kind: 'not-found' },
    });
  });

  it('passes the api error list through for other client errors', async () => {
    const errors = [{ code: 3, message: 'Invalid region', status: 400 }];
    const { client } = harness([{ status: 400, json: { errors } }]);

    expect(await client.getVersion('eu')).toEqual({
      ok: false,
      error: { kind: 'http', status: 400, errors },
    });
  });

  it('survives an error body that is not the documented shape', async () => {
    const { client } = harness([{ status: 400, badBody: true }]);

    expect(await client.getVersion('eu')).toEqual({
      ok: false,
      error: { kind: 'http', status: 400, errors: [] },
    });
  });

  it('reports an unparseable success body', async () => {
    const { client } = harness([{ badBody: true }]);

    expect(await client.getVersion('eu')).toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
  });

  it('reports an envelope whose data is null', async () => {
    const { client } = harness([{ json: { status: 200, data: null } }]);

    expect(await client.getVersion('eu')).toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
  });

  it('retries a 429 and succeeds on the next attempt', async () => {
    const { client, calls } = harness([
      { status: 429, headers: { 'retry-after': '2' } },
      okBody({ version_for_api: '10.0' }),
    ]);

    const result = await client.getVersion('eu');

    expect(result).toEqual({ ok: true, value: { version_for_api: '10.0' } });
    expect(calls).toHaveLength(2);
  });

  it('waits as long as retry-after asks', async () => {
    const { client, slept } = harness([
      { status: 429, headers: { 'retry-after': '2' } },
      okBody({}),
    ]);

    await client.getVersion('eu');

    // 2s plus or minus the jitter.
    expect(slept[0]).toBeGreaterThanOrEqual(1_600);
    expect(slept[0]).toBeLessThanOrEqual(2_400);
  });

  it('falls back to the reset header when retry-after is missing', async () => {
    const { client, slept } = harness([
      { status: 429, headers: { 'x-ratelimit-reset': '10' } },
      okBody({}),
    ]);

    await client.getVersion('eu');

    expect(slept[0]).toBeGreaterThanOrEqual(8_000);
    expect(slept[0]).toBeLessThanOrEqual(12_000);
  });

  it('holds the shared limiter back after a 429', async () => {
    // No retries, so the penalty is still in force when the call returns and can
    // be observed; with retries the client itself waits it out on the way past.
    const { client, limiter } = harness([{ status: 429, headers: { 'retry-after': '5' } }], 0);

    await client.getVersion('eu');

    const blockedUntil = limiter.state().blockedUntil ?? 0;
    expect(blockedUntil).toBeGreaterThan(START);
  });

  it('gives up with rate-limited after the retries are spent', async () => {
    const { client, calls } = harness([{ status: 429 }], 2);

    const result = await client.getVersion('eu');

    expect(result).toEqual({ ok: false, error: { kind: 'rate-limited' } });
    expect(calls).toHaveLength(3);
  });

  it('retries a server error and gives up as a network failure', async () => {
    const { client, calls } = harness([{ status: 503 }], 1);

    const result = await client.getVersion('eu');

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
    expect(calls).toHaveLength(2);
  });

  it('retries when fetch itself throws', async () => {
    const { client, calls } = harness([{ networkError: true }, okBody({ branch: 'live' })]);

    expect(await client.getVersion('eu')).toEqual({ ok: true, value: { branch: 'live' } });
    expect(calls).toHaveLength(2);
  });

  it('gives up as a network failure when fetch never succeeds', async () => {
    const { client } = harness([{ networkError: true }], 1);

    expect(await client.getVersion('eu')).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('hands back raw bytes for the crosshair image', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const { client, calls } = harness([{ bytes }]);

    const result = await client.generateCrosshair({ id: '0;P;h;0' });

    expect(result).toEqual({ ok: true, value: bytes });
    expect(calls[0]?.url).toBe(
      'https://api.henrikdev.xyz/valorant/v1/crosshair/generate?id=0%3BP%3Bh%3B0',
    );
  });

  it('reports a crosshair body it cannot read', async () => {
    const { client } = harness([{ badBody: true }]);

    expect(await client.generateCrosshair()).toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
  });

  it('counts requests, failures and rate-limit hits', async () => {
    const { client } = harness([{ status: 429 }], 1);

    await client.getVersion('eu');
    const stats = client.stats();

    expect(stats).toMatchObject({ requests: 2, failures: 1, rateLimitHits: 2, limit: 30 });
    expect(stats.lastRateLimitedAt).toBeGreaterThanOrEqual(START);
  });

  it('starts with clean statistics', () => {
    const { client } = harness([okBody({})]);

    expect(client.stats()).toMatchObject({
      requests: 0,
      failures: 0,
      rateLimitHits: 0,
      lastRateLimitedAt: null,
      blockedUntil: null,
    });
  });
});

describe('endpoint routing', () => {
  const url = async (call: (client: ValorantClient) => Promise<unknown>): Promise<string> => {
    const { client, calls } = harness([okBody({})]);
    await call(client);
    return calls[0]?.url ?? '';
  };

  const base = 'https://api.henrikdev.xyz';

  it.each([
    [
      'account by puuid',
      (c: ValorantClient) => c.getAccountByPuuid('p-1', { force: true }),
      `${base}/valorant/v2/by-puuid/account/p-1?force=true`,
    ],
    [
      'mmr by name',
      (c: ValorantClient) => c.getMmr('eu', 'pc', 'Name', 'EUW'),
      `${base}/valorant/v3/mmr/eu/pc/Name/EUW`,
    ],
    [
      'mmr by puuid',
      (c: ValorantClient) => c.getMmrByPuuid('eu', 'pc', 'p-1'),
      `${base}/valorant/v3/by-puuid/mmr/eu/pc/p-1`,
    ],
    [
      'mmr history by name',
      (c: ValorantClient) => c.getMmrHistory('eu', 'pc', 'Name', 'EUW'),
      `${base}/valorant/v2/mmr-history/eu/pc/Name/EUW`,
    ],
    [
      'mmr history by puuid',
      (c: ValorantClient) => c.getMmrHistoryByPuuid('eu', 'pc', 'p-1'),
      `${base}/valorant/v2/by-puuid/mmr-history/eu/pc/p-1`,
    ],
    [
      'matches by puuid',
      (c: ValorantClient) => c.getMatchesByPuuid('eu', 'pc', 'p-1', { mode: 'Competitive' }),
      `${base}/valorant/v4/by-puuid/matches/eu/pc/p-1?mode=Competitive`,
    ],
    [
      'stored matches by name',
      (c: ValorantClient) => c.getStoredMatches('eu', 'Name', 'EUW', { map: 'Ascent' }),
      `${base}/valorant/v1/stored-matches/eu/Name/EUW?map=Ascent`,
    ],
    [
      'stored matches by puuid',
      (c: ValorantClient) => c.getStoredMatchesByPuuid('eu', 'p-1', { size: 3 }),
      `${base}/valorant/v1/by-puuid/stored-matches/eu/p-1?size=3`,
    ],
    [
      'stored mmr history by name',
      (c: ValorantClient) => c.getStoredMmrHistory('eu', 'pc', 'Name', 'EUW', { size: 2 }),
      `${base}/valorant/v2/stored-mmr-history/eu/pc/Name/EUW?size=2`,
    ],
    [
      'stored mmr history by puuid',
      (c: ValorantClient) => c.getStoredMmrHistoryByPuuid('eu', 'pc', 'p-1'),
      `${base}/valorant/v2/by-puuid/stored-mmr-history/eu/pc/p-1`,
    ],
    [
      'leaderboard',
      (c: ValorantClient) => c.getLeaderboard('eu', 'pc', { season: 'e1a1', page: 2 }),
      `${base}/valorant/v3/leaderboard/eu/pc?season=e1a1&page=2`,
    ],
    [
      'premier search',
      (c: ValorantClient) => c.searchPremierTeams({ name: 'Team' }),
      `${base}/valorant/v1/premier/search?name=Team`,
    ],
    [
      'premier leaderboard',
      (c: ValorantClient) => c.getPremierLeaderboard('eu', { division: '1' }),
      `${base}/valorant/v1/premier/leaderboard/eu?division=1`,
    ],
    [
      'premier team by name',
      (c: ValorantClient) => c.getPremierTeam('Team', 'TAG'),
      `${base}/valorant/v1/premier/Team/TAG`,
    ],
    [
      'premier team by id',
      (c: ValorantClient) => c.getPremierTeamById('team-1'),
      `${base}/valorant/v1/premier/team-1`,
    ],
    [
      'premier history by name',
      (c: ValorantClient) => c.getPremierTeamHistory('Team', 'TAG'),
      `${base}/valorant/v1/premier/Team/TAG/history`,
    ],
    [
      'premier history by id',
      (c: ValorantClient) => c.getPremierTeamHistoryById('team-1'),
      `${base}/valorant/v1/premier/team-1/history`,
    ],
    [
      'esports schedule',
      (c: ValorantClient) => c.getEsportsSchedule({ region: 'emea' }),
      `${base}/valorant/v1/esports/schedule?region=emea`,
    ],
    [
      'vlr events',
      (c: ValorantClient) => c.getVlrEvents({ page: 2 }),
      `${base}/valorant/v2/esports/vlr/events?page=2`,
    ],
    [
      'vlr event matches',
      (c: ValorantClient) => c.getVlrEventMatches(42),
      `${base}/valorant/v2/esports/vlr/events/42/matches`,
    ],
    [
      'vlr match',
      (c: ValorantClient) => c.getVlrMatch('m-1'),
      `${base}/valorant/v2/esports/vlr/matches/m-1`,
    ],
    ['vlr team', (c: ValorantClient) => c.getVlrTeam(7), `${base}/valorant/v2/esports/vlr/teams/7`],
    [
      'vlr team matches',
      (c: ValorantClient) => c.getVlrTeamMatches(7, { page: 3 }),
      `${base}/valorant/v2/esports/vlr/teams/7/matches?page=3`,
    ],
    [
      'vlr team transactions',
      (c: ValorantClient) => c.getVlrTeamTransactions(7),
      `${base}/valorant/v2/esports/vlr/teams/7/transactions`,
    ],
    [
      'vlr player',
      (c: ValorantClient) => c.getVlrPlayer(9, { timespan: 'all' }),
      `${base}/valorant/v2/esports/vlr/players/9?timespan=all`,
    ],
    [
      'vlr player matches',
      (c: ValorantClient) => c.getVlrPlayerMatches(9),
      `${base}/valorant/v2/esports/vlr/players/9/matches`,
    ],
    [
      'content',
      (c: ValorantClient) => c.getContent({ locale: 'de-DE' }),
      `${base}/valorant/v1/content?locale=de-DE`,
    ],
    [
      'featured store',
      (c: ValorantClient) => c.getFeaturedStore(),
      `${base}/valorant/v2/store-featured`,
    ],
    ['store offers', (c: ValorantClient) => c.getStoreOffers(), `${base}/valorant/v2/store-offers`],
    ['status', (c: ValorantClient) => c.getStatus('eu'), `${base}/valorant/v1/status/eu`],
    [
      'queue status',
      (c: ValorantClient) => c.getQueueStatus('eu'),
      `${base}/valorant/v1/queue-status/eu`,
    ],
    ['version', (c: ValorantClient) => c.getVersion('eu'), `${base}/valorant/v1/version/eu`],
    [
      'website',
      (c: ValorantClient) => c.getWebsite('de-de', { category: 'patch_notes' }),
      `${base}/valorant/v1/website/de-de?category=patch_notes`,
    ],
    [
      'website entry',
      (c: ValorantClient) => c.getWebsiteEntry('de-de', 'entry-1'),
      `${base}/valorant/v1/website/de-de/entry-1`,
    ],
    [
      'raw',
      (c: ValorantClient) => c.postRaw({ type: 't', value: 'v', region: 'eu' }),
      `${base}/valorant/v1/raw`,
    ],
    [
      'webhook settings',
      (c: ValorantClient) => c.getWebhookSettings(),
      `${base}/public/v1/premium/webhook`,
    ],
    [
      'add webhook user',
      (c: ValorantClient) => c.addWebhookUser({ puuid: 'p-1' }),
      `${base}/public/v1/premium/webhook/users`,
    ],
    [
      'update webhook user',
      (c: ValorantClient) => c.updateWebhookUser('w-1', { events: ['MATCH'] }),
      `${base}/public/v1/premium/webhook/users/w-1`,
    ],
    [
      'delete webhook user',
      (c: ValorantClient) => c.deleteWebhookUser('w-1'),
      `${base}/public/v1/premium/webhook/users/w-1`,
    ],
  ])('routes %s', async (_name, call, expected) => {
    expect(await url(call)).toBe(expected);
  });

  it.each([
    ['add webhook user', (c: ValorantClient) => c.addWebhookUser({ puuid: 'p-1' }), 'POST'],
    ['update webhook user', (c: ValorantClient) => c.updateWebhookUser('w-1', {}), 'PUT'],
    ['delete webhook user', (c: ValorantClient) => c.deleteWebhookUser('w-1'), 'DELETE'],
  ])('uses the right method for %s', async (_name, call, method) => {
    const { client, calls } = harness([okBody({})]);
    await call(client);
    expect(calls[0]?.init.method).toBe(method);
  });
});

describe('createValorantClient request reporting', () => {
  it('reports a successful request once', async () => {
    const { client, requests } = harness([okBody({ puuid: 'p' })]);

    await client.getAccount('Foo', 'EUW');

    expect(requests).toEqual([
      {
        method: 'GET',
        path: '/valorant/v2/account/Foo/EUW',
        status: 200,
        attempts: 1,
        durationMs: 0,
      },
    ]);
  });

  it('reports the query it was sent with, minus the options left unset', async () => {
    const { client, requests } = harness([okBody({ puuid: 'p' })]);

    await client.getAccount('Foo', 'EUW', { force: true });

    expect(requests[0]?.query).toEqual({ force: true });
  });

  it('leaves the query out when there is none', async () => {
    const { client, requests } = harness([okBody({ puuid: 'p' })]);

    await client.getAccount('Foo', 'EUW');

    expect(requests[0]).not.toHaveProperty('query');
  });

  it('folds retries into one report and counts the attempts', async () => {
    const { client, requests } = harness([
      { status: 500 },
      { status: 500 },
      okBody({ puuid: 'p' }),
    ]);

    await client.getAccount('Foo', 'EUW');

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ status: 200, attempts: 3 });
  });

  it('counts the backoff it waited through as part of the duration', async () => {
    const { client, requests } = harness([{ status: 500 }, okBody({ puuid: 'p' })]);

    await client.getAccount('Foo', 'EUW');

    expect(requests[0]?.durationMs).toBeGreaterThan(0);
  });

  it('reports the failure kind of a request that gave up', async () => {
    const { client, requests } = harness([{ status: 500 }], 1);

    await client.getAccount('Foo', 'EUW');

    expect(requests).toEqual([
      expect.objectContaining({ status: 500, attempts: 2, error: 'network' }),
    ]);
  });

  it('reports a request that was rejected outright', async () => {
    const { client, requests } = harness([{ status: 404 }]);

    await client.getAccount('Foo', 'EUW');

    expect(requests[0]).toMatchObject({ status: 404, attempts: 1, error: 'not-found' });
  });

  it('reports no status when nothing ever answered', async () => {
    const { client, requests } = harness([{ networkError: true }], 0);

    await client.getAccount('Foo', 'EUW');

    expect(requests[0]).toMatchObject({ status: 0, attempts: 1, error: 'network' });
  });

  it('reports the method and path of a request that carries a body', async () => {
    const { client, requests } = harness([okBody({ ok: true })]);

    await client.addWebhookUser({ name: 'Foo', tag: 'EUW' });

    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/public/v1/premium/webhook/users',
    });
    // Bodies are deliberately never reported.
    expect(requests[0]).not.toHaveProperty('body');
  });

  it('says nothing when no reporter was given', async () => {
    const { fetchImpl } = stubFetch([okBody({ puuid: 'p' })]);
    const client = createValorantClient({
      apiKey: 'HDEV-test-key',
      limiter: createRateLimiter({ limit: 30 }),
      fetchImpl,
    });

    await expect(client.getAccount('Foo', 'EUW')).resolves.toMatchObject({ ok: true });
  });
});
