import { describe, expect, it } from 'vitest';
import { resolveRequest } from '../../../src/http/router.ts';
import { valorantPlaygroundRoute } from '../../../src/http/routes/valorantPlayground.ts';
import type { HttpResponse } from '../../../src/http/types.ts';
import type {
  ValorantClient,
  ValorantResult,
  ValorantStats,
} from '../../../src/valorant/client.ts';
import { silentLogger } from '../../helpers/fakes.ts';

const SECRET = 'abcdefghijklmnopqrstuvwxyz123456';
const BASE = 'http://bot.example.net';

interface Recorded {
  readonly method: string;
  readonly args: readonly unknown[];
}

const STATS: ValorantStats = {
  used: 3,
  limit: 30,
  waiting: 1,
  blockedUntil: null,
  requests: 9,
  failures: 0,
  rateLimitHits: 0,
  lastRateLimitedAt: null,
};

/**
 * Answers every catalog method with the same canned result, recording which one
 * the route reached for.
 */
const spyClient = (result: ValorantResult<unknown> = { ok: true, value: { hello: 'world' } }) => {
  const calls: Recorded[] = [];

  const client = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        if (property === 'stats') {
          return () => STATS;
        }
        return async (...args: readonly unknown[]) => {
          calls.push({ method: property, args });
          return result;
        };
      },
    },
  ) as ValorantClient;

  return { client, calls };
};

const request = (path: string, client: ValorantClient, method = 'GET'): Promise<HttpResponse> => {
  const target = new URL(path, BASE);
  return resolveRequest({ method, pathname: target.pathname, query: target.searchParams }, [
    valorantPlaygroundRoute({ client, secret: SECRET, logger: silentLogger() }),
  ]);
};

const page = (client: ValorantClient) => request(`/${SECRET}/valorant-playground`, client);

const call = (query: string, client: ValorantClient) =>
  request(`/${SECRET}/valorant-playground/call?${query}`, client);

const bodyOf = (response: HttpResponse): Record<string, unknown> =>
  JSON.parse(response.body) as Record<string, unknown>;

describe('the hidden path', () => {
  it('serves the page at the configured secret', async () => {
    const response = await page(spyClient().client);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('Valorant API playground');
  });

  it.each([
    '/wrong-secret/valorant-playground',
    '/valorant-playground',
    `/${SECRET}x/valorant-playground`,
    `/${SECRET.slice(0, -1)}/valorant-playground`,
    `/${SECRET}/valorant-playground/other`,
    `/${SECRET}`,
  ])('answers 404 for %o', async (path) => {
    expect((await request(path, spyClient().client)).status).toBe(404);
  });

  it('does not leak the secret in the 404 body', async () => {
    const response = await request('/wrong/valorant-playground', spyClient().client);

    expect(response.body).toBe('Not found');
  });

  it('never reaches the api for a wrong secret', async () => {
    const spy = spyClient();

    await request(`/wrong/valorant-playground/call?endpoint=getVersion&affinity=eu`, spy.client);

    expect(spy.calls).toEqual([]);
  });

  it('answers 405 for a write method', async () => {
    const response = await request(`/${SECRET}/valorant-playground`, spyClient().client, 'POST');

    expect(response.status).toBe(405);
    expect(response.headers['Allow']).toBe('GET, HEAD');
  });

  it('keeps the page out of search engines and caches', async () => {
    const response = await page(spyClient().client);

    expect(response.headers['X-Robots-Tag']).toContain('noindex');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.headers['Referrer-Policy']).toBe('no-referrer');
  });

  it('matches repeatedly, so the second visit still works', async () => {
    const spy = spyClient();

    expect((await page(spy.client)).status).toBe(200);
    expect((await page(spy.client)).status).toBe(200);
  });
});

describe('the page', () => {
  it('lists every catalog endpoint for the form to drive', async () => {
    const response = await page(spyClient().client);

    expect(response.body).toContain('window.__ENDPOINTS__');
    expect(response.body).toContain('getAccount');
    expect(response.body).toContain('getMatchesByPuuid');
    expect(response.body).toContain('generateCrosshair');
  });

  it('shows the rate limit the bot is already using', async () => {
    const response = await page(spyClient().client);

    expect(response.body).toContain('3/30');
  });

  it('loads nothing from outside itself', async () => {
    const response = await page(spyClient().client);

    expect(response.body).not.toMatch(/src="http/);
    expect(response.headers['Content-Security-Policy']).toContain("default-src 'none'");
  });
});

describe('calling an endpoint', () => {
  it('reaches the client method the catalog names', async () => {
    const spy = spyClient();

    await call('endpoint=getAccount&name=Bogenpirat&tag=EUW', spy.client);

    expect(spy.calls).toEqual([
      { method: 'getAccount', args: ['Bogenpirat', 'EUW', { force: undefined }] },
    ]);
  });

  it('passes path parameters in the order the method expects', async () => {
    const spy = spyClient();

    await call('endpoint=getMmr&affinity=eu&platform=pc&name=Name&tag=EUW', spy.client);

    expect(spy.calls[0]).toEqual({ method: 'getMmr', args: ['eu', 'pc', 'Name', 'EUW'] });
  });

  it('returns the payload with the rate-limit state alongside it', async () => {
    const response = await call('endpoint=getVersion&affinity=eu', spyClient().client);

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({
      ok: true,
      value: { hello: 'world' },
      rateLimit: { used: 3, limit: 30, waiting: 1 },
    });
  });

  it('reports a client failure as data, not as an http error', async () => {
    const spy = spyClient({ ok: false, error: { kind: 'rate-limited' } });

    const response = await call('endpoint=getVersion&affinity=eu', spy.client);

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
  });

  it('rejects an endpoint that is not in the catalog', async () => {
    const spy = spyClient();

    const response = await call('endpoint=deleteEverything', spy.client);

    expect(response.status).toBe(400);
    expect(bodyOf(response)).toMatchObject({ error: { kind: 'unknown-endpoint' } });
    expect(spy.calls).toEqual([]);
  });

  it('rejects a call with no endpoint at all', async () => {
    expect((await call('', spyClient().client)).status).toBe(400);
  });

  it('names the required parameters that were left blank', async () => {
    const spy = spyClient();

    const response = await call('endpoint=getMmr&affinity=eu', spy.client);

    expect(response.status).toBe(400);
    expect(bodyOf(response)).toMatchObject({
      error: { kind: 'missing-parameters', missing: ['platform', 'name', 'tag'] },
    });
    expect(spy.calls).toEqual([]);
  });

  it('treats a whitespace-only value as missing', async () => {
    const response = await call('endpoint=getVersion&affinity=%20%20', spyClient().client);

    expect(bodyOf(response)).toMatchObject({ error: { missing: ['affinity'] } });
  });

  it('trims a value before passing it on', async () => {
    const spy = spyClient();

    await call('endpoint=getVersion&affinity=%20eu%20', spy.client);

    expect(spy.calls[0]?.args).toEqual(['eu']);
  });

  it('omits optional parameters that were left blank', async () => {
    const spy = spyClient();

    await call('endpoint=getMatches&affinity=eu&platform=pc&name=N&tag=EUW&size=5', spy.client);

    expect(spy.calls[0]?.args[4]).toEqual({
      mode: undefined,
      map: undefined,
      size: 5,
      start: undefined,
    });
  });

  it('reads a number parameter as a number', async () => {
    const spy = spyClient();

    await call('endpoint=getVlrTeam&teamId=2593', spy.client);

    expect(spy.calls[0]?.args).toEqual([2593]);
  });

  it('ignores a number parameter that is not one', async () => {
    const spy = spyClient();

    await call('endpoint=getVlrTeamMatches&teamId=7&page=lots', spy.client);

    expect(spy.calls[0]?.args).toEqual([7, { page: undefined }]);
  });

  it('reads a boolean parameter', async () => {
    const spy = spyClient();

    await call('endpoint=getAccountByPuuid&puuid=p-1&force=true', spy.client);

    expect(spy.calls[0]?.args).toEqual(['p-1', { force: true }]);
  });

  it('reads anything other than true as false', async () => {
    const spy = spyClient();

    await call('endpoint=getAccountByPuuid&puuid=p-1&force=false', spy.client);

    expect(spy.calls[0]?.args).toEqual(['p-1', { force: false }]);
  });

  it('base64-encodes the crosshair image instead of printing its bytes', async () => {
    const spy = spyClient({ ok: true, value: new Uint8Array([137, 80, 78, 71]) });

    const response = await call('endpoint=generateCrosshair&id=0;P', spy.client);

    expect(bodyOf(response)).toMatchObject({ ok: true, image: 'iVBORw==' });
  });

  it('answers json with no-store on a call', async () => {
    const response = await call('endpoint=getVersion&affinity=eu', spyClient().client);

    expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(response.headers['Cache-Control']).toBe('no-store');
  });
});
