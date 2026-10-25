import { describe, expect, it } from 'vitest';
import {
  createWardogsClient,
  type WardogsFetch,
  type WardogsFetchResponse,
} from '../../src/wardogs/client.ts';
import { SAMPLE_RESPONSE } from '../helpers/wardogs.ts';

const KEY = 'id|91052133-1e18-4af8-b54e-499ab279f446';
const OTHER_KEY = 'id|00000000-0000-0000-0000-000000000000';

const respond = (status: number, body: unknown = {}): WardogsFetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const recordingFetch = (impl: (url: string) => Promise<WardogsFetchResponse>) => {
  const urls: string[] = [];
  const fetchImpl: WardogsFetch = async (url) => {
    urls.push(url);
    return impl(url);
  };
  return { urls, fetchImpl };
};

describe('createWardogsClient', () => {
  it('asks by key with the pipe encoded and no window', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(200, SAMPLE_RESPONSE));
    const result = await createWardogsClient(fetchImpl).getServerDetail(KEY);

    expect(urls).toEqual([
      'https://wardogserverlist.com/api/server-detail?key=id%7C91052133-1e18-4af8-b54e-499ab279f446',
    ]);
    expect(result.kind).toBe('live');
  });

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'error'],
  ])('maps status %i to %s', async (status, kind) => {
    const { fetchImpl } = recordingFetch(async () => respond(status));
    expect(await createWardogsClient(fetchImpl).getServerDetail(KEY)).toEqual({ kind });
  });

  it('reports a failed request as an error', async () => {
    const { fetchImpl } = recordingFetch(async () => {
      throw new Error('network down');
    });
    expect(await createWardogsClient(fetchImpl).getServerDetail(KEY)).toEqual({
      kind: 'error',
    });
  });

  it('serves a repeat lookup from the cache until it expires', async () => {
    let clock = 0;
    const { urls, fetchImpl } = recordingFetch(async () => respond(200, SAMPLE_RESPONSE));
    const client = createWardogsClient(fetchImpl, () => clock);

    await client.getServerDetail(KEY);
    clock = 59_999;
    await client.getServerDetail(KEY);
    expect(urls).toHaveLength(1);

    clock = 60_000;
    await client.getServerDetail(KEY);
    expect(urls).toHaveLength(2);
  });

  it('caches per key', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(404));
    const client = createWardogsClient(fetchImpl, () => 0);

    await client.getServerDetail(KEY);
    await client.getServerDetail(OTHER_KEY);
    await client.getServerDetail(OTHER_KEY);
    expect(urls).toHaveLength(2);
  });

  it('retries after a rate limit instead of caching it', async () => {
    const statuses = [429, 200];
    const { urls, fetchImpl } = recordingFetch(async () =>
      respond(statuses.shift() ?? 200, SAMPLE_RESPONSE),
    );
    const client = createWardogsClient(fetchImpl, () => 0);

    expect((await client.getServerDetail(KEY)).kind).toBe('rate-limited');
    expect((await client.getServerDetail(KEY)).kind).toBe('live');
    expect(urls).toHaveLength(2);
  });
});
