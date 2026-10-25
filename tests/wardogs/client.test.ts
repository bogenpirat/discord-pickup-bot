import { describe, expect, it } from 'vitest';
import {
  createWardogsClient,
  type WardogsFetch,
  type WardogsFetchResponse,
} from '../../src/wardogs/client.ts';
import { SAMPLE_RESPONSE } from '../helpers/wardogs.ts';

const KEY_REF = { param: 'key', value: 'id|91052133-1e18-4af8-b54e-499ab279f446' } as const;
const ID_REF = { param: 'id', value: '89' } as const;

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
    const result = await createWardogsClient(fetchImpl).getServerDetail(KEY_REF);

    expect(urls).toEqual([
      'https://wardogserverlist.com/api/server-detail?key=id%7C91052133-1e18-4af8-b54e-499ab279f446',
    ]);
    expect(result.kind).toBe('live');
  });

  it('asks by id for a numeric reference', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(200, SAMPLE_RESPONSE));
    await createWardogsClient(fetchImpl).getServerDetail(ID_REF);

    expect(urls).toEqual(['https://wardogserverlist.com/api/server-detail?id=89']);
  });

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'error'],
  ])('maps status %i to %s', async (status, kind) => {
    const { fetchImpl } = recordingFetch(async () => respond(status));
    expect(await createWardogsClient(fetchImpl).getServerDetail(ID_REF)).toEqual({ kind });
  });

  it('reports a failed request as an error', async () => {
    const { fetchImpl } = recordingFetch(async () => {
      throw new Error('network down');
    });
    expect(await createWardogsClient(fetchImpl).getServerDetail(ID_REF)).toEqual({
      kind: 'error',
    });
  });

  it('serves a repeat lookup from the cache until it expires', async () => {
    let clock = 0;
    const { urls, fetchImpl } = recordingFetch(async () => respond(200, SAMPLE_RESPONSE));
    const client = createWardogsClient(fetchImpl, () => clock);

    await client.getServerDetail(KEY_REF);
    clock = 59_999;
    await client.getServerDetail(KEY_REF);
    expect(urls).toHaveLength(1);

    clock = 60_000;
    await client.getServerDetail(KEY_REF);
    expect(urls).toHaveLength(2);
  });

  it('caches per reference', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(404));
    const client = createWardogsClient(fetchImpl, () => 0);

    await client.getServerDetail(KEY_REF);
    await client.getServerDetail(ID_REF);
    await client.getServerDetail(ID_REF);
    expect(urls).toHaveLength(2);
  });

  it('retries after a rate limit instead of caching it', async () => {
    const statuses = [429, 200];
    const { urls, fetchImpl } = recordingFetch(async () =>
      respond(statuses.shift() ?? 200, SAMPLE_RESPONSE),
    );
    const client = createWardogsClient(fetchImpl, () => 0);

    expect((await client.getServerDetail(ID_REF)).kind).toBe('rate-limited');
    expect((await client.getServerDetail(ID_REF)).kind).toBe('live');
    expect(urls).toHaveLength(2);
  });
});
