import { describe, expect, it } from 'vitest';
import type { LiveServerDetail } from '../../src/domain/wardogs/parseServerDetail.ts';
import {
  bannerUrl,
  createImageFetch,
  createWardogsClient,
  serverPageUrl,
  type WardogsFetch,
  type WardogsFetchResponse,
} from '../../src/wardogs/client.ts';
import { solidJpeg, solidPng } from '../helpers/images.ts';
import { SAMPLE_RESPONSE } from '../helpers/wardogs.ts';

const KEY = 'id|91052133-1e18-4af8-b54e-499ab279f446';
const OTHER_KEY = 'id|00000000-0000-0000-0000-000000000000';

const respond = (
  status: number,
  body: unknown = {},
  headers: Readonly<Record<string, string>> = {},
): WardogsFetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => body,
  arrayBuffer: async () => {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(0);
    return new Uint8Array(bytes).buffer;
  },
});

const recordingFetch = (impl: (url: string) => Promise<WardogsFetchResponse>) => {
  const urls: string[] = [];
  const fetchImpl: WardogsFetch = async (url) => {
    urls.push(url);
    return impl(url);
  };
  return { urls, fetchImpl };
};

describe('bannerUrl', () => {
  it('asks for the wide card with the key encoded and a version', () => {
    expect(bannerUrl('eu-central|asdz-alte-säcke', 1792885338)).toBe(
      'https://wardogserverlist.com/banner.jpg?key=eu-central%7Casdz-alte-s%C3%A4cke&style=wide&v=1792885338',
    );
  });
});

describe('serverPageUrl', () => {
  it('links the server page by its encoded key', () => {
    expect(serverPageUrl('eu-central|asdz-alte-säcke')).toBe(
      'https://wardogserverlist.com/server?key=eu-central%7Casdz-alte-s%C3%A4cke',
    );
  });
});

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

describe('createImageFetch', () => {
  const IMAGE_URL = 'https://files.example/banner.png';
  const IMAGE = solidPng(2, 2, [1, 2, 3, 255]);

  it('downloads the bytes with a timeout signal', async () => {
    let signal: AbortSignal | undefined;
    const fetchImage = createImageFetch(async (_url, init) => {
      signal = init?.signal;
      return respond(200, IMAGE);
    });

    expect(await fetchImage(IMAGE_URL)).toEqual(new Uint8Array(IMAGE));
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses anything but https without asking', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(200, IMAGE));
    const fetchImage = createImageFetch(fetchImpl);

    expect(await fetchImage('http://files.example/banner.png')).toBeNull();
    expect(await fetchImage('not a url')).toBeNull();
    expect(urls).toEqual([]);
  });

  it.each([
    ['a failed status', respond(404, IMAGE)],
    ['a declared size past the cap', respond(200, IMAGE, { 'content-length': String(9e6) })],
    ['a body past the cap', respond(200, new Uint8Array(8 * 1024 * 1024 + 1))],
  ])('returns null for %s', async (_label, response) => {
    expect(await createImageFetch(async () => response)(IMAGE_URL)).toBeNull();
  });

  it('returns null when the request throws', async () => {
    const fetchImage = createImageFetch(async () => {
      throw new Error('timed out');
    });
    expect(await fetchImage(IMAGE_URL)).toBeNull();
  });
});

describe('getBanner', () => {
  const NOW = Temporal.Instant.from('2026-10-25T00:00:00Z');

  const live = (overrides: Partial<LiveServerDetail> = {}): LiveServerDetail => ({
    kind: 'live',
    updatedAt: Temporal.Instant.from('2026-10-24T23:42:18.954Z'),
    linkKey: 'eu-central|asdz',
    server: {
      name: 'ASDZ',
      players: 81,
      maxPlayers: 100,
      map: 'Madrid',
      world: 'Europe',
      sky: 'DayClear',
      matchStart: null,
      passworded: false,
      imageUrl: 'https://files.example/asdz.png',
    },
    ...overrides,
  });

  it('fetches the server banner and the card versioned by the poll, and merges them', async () => {
    const { urls, fetchImpl } = recordingFetch(async (url) =>
      respond(
        200,
        url.includes('banner.jpg')
          ? solidJpeg(12, 5, [0, 0, 255])
          : solidPng(4, 1, [255, 0, 0, 255]),
      ),
    );

    const banner = await createWardogsClient(fetchImpl).getBanner(live(), NOW);

    expect(urls.sort()).toEqual([
      'https://files.example/asdz.png',
      'https://wardogserverlist.com/banner.jpg?key=eu-central%7Casdz&style=wide&v=1792885338',
    ]);
    expect(banner?.name).toBe('wardogs.jpg');
  });

  it('versions the card by now when the poll time is unknown', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(404));

    await createWardogsClient(fetchImpl).getBanner(live({ updatedAt: null }), NOW);

    expect(urls).toContain(
      `https://wardogserverlist.com/banner.jpg?key=eu-central%7Casdz&style=wide&v=${NOW.epochMilliseconds / 1000}`,
    );
  });

  it('asks for no card without a link key', async () => {
    const { urls, fetchImpl } = recordingFetch(async () => respond(404));

    expect(await createWardogsClient(fetchImpl).getBanner(live({ linkKey: null }), NOW)).toBeNull();
    expect(urls).toEqual(['https://files.example/asdz.png']);
  });
});
