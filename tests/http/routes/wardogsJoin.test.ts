import { describe, expect, it } from 'vitest';
import { parseServerDetailResponse } from '../../../src/domain/wardogs/parseServerDetail.ts';
import { resolveRequest } from '../../../src/http/router.ts';
import { wardogsJoinRoute } from '../../../src/http/routes/wardogsJoin.ts';
import type { HttpResponse } from '../../../src/http/types.ts';
import type { WardogsJoinResult, WardogsLookupResult } from '../../../src/wardogs/client.ts';
import { silentLogger } from '../../helpers/fakes.ts';
import { fakeWardogsClient, SAMPLE_RESPONSE } from '../../helpers/wardogs.ts';

const GUID = '91052133-1e18-4af8-b54e-499ab279f446';
const LINK = 'steam://joinlobby/1867240/109775242246499170';
const NOW = 1_792_900_000_000;
const LIVE = parseServerDetailResponse(SAMPLE_RESPONSE);

const get = async (
  path: string,
  join: WardogsJoinResult = { kind: 'link', link: LINK, name: 'ASDZ <DE>' },
  detail: WardogsLookupResult = { kind: 'error' },
): Promise<{ response: HttpResponse; calls: string[] }> => {
  const wardogs = fakeWardogsClient(detail, null, join);
  const target = new URL(path, 'http://bot.example.net');
  const response = await resolveRequest(
    { method: 'GET', pathname: target.pathname, query: target.searchParams },
    [wardogsJoinRoute({ wardogs: wardogs.client, logger: silentLogger(), now: () => NOW })],
  );
  return { response, calls: wardogs.calls };
};

describe('the wardogs join page', () => {
  it('asks for the link by the server key and refreshes to it', async () => {
    const { response, calls } = await get(`/pickup/wardogs/join/${GUID}`);

    expect(calls).toContain(`id|${GUID}`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.body).toContain(`<meta http-equiv="refresh" content="0; url=${LINK}">`);
    expect(response.body).toContain(`<a class="button" href="${LINK}">`);
  });

  it('escapes the server name', async () => {
    const { response } = await get(`/pickup/wardogs/join/${GUID}`);

    expect(response.body).toContain('<title>ASDZ &lt;DE&gt;</title>');
    expect(response.body).not.toContain('<DE>');
  });

  it('accepts an upper-case join code', async () => {
    const { calls } = await get(`/pickup/wardogs/join/${GUID.toUpperCase()}`);
    expect(calls).toContain(`id|${GUID}`);
  });

  it('speaks the language asked for', async () => {
    expect((await get(`/pickup/wardogs/join/${GUID}?lang=en`)).response.body).toContain(
      'Opening Steam',
    );
    expect((await get(`/pickup/wardogs/join/${GUID}`)).response.body).toContain(
      'Steam wird geöffnet',
    );
  });

  describe('with the server details', () => {
    it('shows the site card, the players and the map', async () => {
      const { response } = await get(`/pickup/wardogs/join/${GUID}?lang=en`, undefined, LIVE);

      expect(response.body).toContain('<title>ASDZ - Alte Säcke Die Zocken | DE | GER</title>');
      expect(response.body).toContain(
        '<img class="hero" src="https://wardogserverlist.com/banner.jpg?key=eu-central%7Casdz-alte-s%C3%A4cke-die-zocken-de-ger&amp;style=wide&amp;v=1792885338"',
      );
      expect(response.body).toContain('Players <b>81/100</b>');
      expect(response.body).toContain('Map <b>Madrid</b> (Europe)');
      expect(response.body).not.toContain('Password');
    });

    it('links the server page by the site key', async () => {
      const { response } = await get(`/pickup/wardogs/join/${GUID}`, undefined, LIVE);
      expect(response.body).toContain(
        'href="https://wardogserverlist.com/server?key=eu-central%7Casdz-alte-s%C3%A4cke-die-zocken-de-ger"',
      );
    });

    it('marks a passworded server', async () => {
      const passworded = parseServerDetailResponse({
        ...SAMPLE_RESPONSE,
        live: { ...SAMPLE_RESPONSE.live, passworded: true },
      });
      const { response } = await get(`/pickup/wardogs/join/${GUID}?lang=en`, undefined, passworded);
      expect(response.body).toContain('🔒 Password');
    });

    it('versions the card by now when the details carry no poll time', async () => {
      const undated = parseServerDetailResponse({ ...SAMPLE_RESPONSE, updatedAt: null });
      const { response } = await get(`/pickup/wardogs/join/${GUID}`, undefined, undated);
      expect(response.body).toContain(`&amp;v=${NOW / 1000}"`);
    });

    it('lets in images from the site only', async () => {
      const { response } = await get(`/pickup/wardogs/join/${GUID}`, undefined, LIVE);
      expect(response.headers['Content-Security-Policy']).toContain(
        'img-src https://wardogserverlist.com',
      );
    });
  });

  it('goes without card and facts when the details are missing', async () => {
    const { response } = await get(`/pickup/wardogs/join/${GUID}`);

    expect(response.body).not.toContain('<img');
    expect(response.body).not.toContain('class="facts"');
    expect(response.body).toContain(`href="https://wardogserverlist.com/server?key=id%7C${GUID}"`);
  });

  it('falls back to a generic title without any name', async () => {
    const { response } = await get(`/pickup/wardogs/join/${GUID}?lang=en`, {
      kind: 'link',
      link: LINK,
      name: null,
    });
    expect(response.body).toContain('<title>Join via Steam</title>');
  });

  it.each([
    '/pickup/wardogs/join/not-a-guid',
    '/pickup/wardogs/join/------------------------------------',
    `/pickup/wardogs/join/${GUID}/extra`,
  ])('answers %s with a 404 without asking the api', async (path) => {
    const { response, calls } = await get(path);
    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it.each([
    [{ kind: 'not-found' }, 404, 'cannot be joined'],
    [{ kind: 'rate-limited' }, 429, 'too many requests'],
    [{ kind: 'error' }, 502, 'not responding'],
    [{ kind: 'invalid' }, 502, 'not responding'],
  ] as const)('explains %j with a %i', async (join, status, text) => {
    const { response } = await get(`/pickup/wardogs/join/${GUID}?lang=en`, join);

    expect(response.status).toBe(status);
    expect(response.body).toContain(text);
    expect(response.body).not.toContain('refresh');
    expect(response.body).not.toContain('class="button"');
  });
});
