import { describe, expect, it } from 'vitest';
import { resolveRequest } from '../../../src/http/router.ts';
import { wardogsJoinRoute } from '../../../src/http/routes/wardogsJoin.ts';
import type { HttpResponse } from '../../../src/http/types.ts';
import type { WardogsJoinResult } from '../../../src/wardogs/client.ts';
import { silentLogger } from '../../helpers/fakes.ts';
import { fakeWardogsClient } from '../../helpers/wardogs.ts';

const GUID = '91052133-1e18-4af8-b54e-499ab279f446';
const LINK = 'steam://joinlobby/1867240/109775242246499170';

const get = async (
  path: string,
  join: WardogsJoinResult = { kind: 'link', link: LINK, name: 'ASDZ <DE>' },
): Promise<{ response: HttpResponse; calls: string[] }> => {
  const wardogs = fakeWardogsClient({ kind: 'error' }, null, join);
  const target = new URL(path, 'http://bot.example.net');
  const response = await resolveRequest(
    { method: 'GET', pathname: target.pathname, query: target.searchParams },
    [wardogsJoinRoute({ wardogs: wardogs.client, logger: silentLogger() })],
  );
  return { response, calls: wardogs.calls };
};

describe('the wardogs join page', () => {
  it('asks for the link by the server key and refreshes to it', async () => {
    const { response, calls } = await get(`/pickup/wardogs/join/${GUID}`);

    expect(calls).toEqual([`id|${GUID}`]);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.body).toContain(`<meta http-equiv="refresh" content="0; url=${LINK}">`);
    expect(response.body).toContain(`<a href="${LINK}">`);
  });

  it('escapes the server name', async () => {
    const { response } = await get(`/pickup/wardogs/join/${GUID}`);

    expect(response.body).toContain('<title>ASDZ &lt;DE&gt;</title>');
    expect(response.body).not.toContain('<DE>');
  });

  it('accepts an upper-case join code', async () => {
    const { calls } = await get(`/pickup/wardogs/join/${GUID.toUpperCase()}`);
    expect(calls).toEqual([`id|${GUID}`]);
  });

  it('speaks the language asked for', async () => {
    expect((await get(`/pickup/wardogs/join/${GUID}?lang=en`)).response.body).toContain(
      'Opening Steam',
    );
    expect((await get(`/pickup/wardogs/join/${GUID}`)).response.body).toContain(
      'Steam wird geöffnet',
    );
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
  });
});
