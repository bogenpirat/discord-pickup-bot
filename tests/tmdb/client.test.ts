import { describe, expect, it } from 'vitest';
import { createTmdbClient, type TmdbFetch } from '../../src/tmdb/client.ts';

interface Request {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
}

/** Answers by path and language; anything unlisted is a 404. */
const fakeTmdb = (routes: Readonly<Record<string, unknown>>) => {
  const requests: Request[] = [];
  const fetchImpl: TmdbFetch = async (url, init) => {
    const parsed = new URL(url);
    requests.push({ url: parsed, headers: init?.headers ?? {} });
    const language = parsed.searchParams.get('language');
    const key = language === null ? parsed.pathname : `${parsed.pathname}@${language}`;
    const body = routes[key];
    return { ok: body !== undefined, json: async () => body };
  };
  return { requests, fetchImpl };
};

const ALIEN = {
  title: 'Alien',
  release_date: '1979-05-25',
  overview: 'Die Crew der Nostromo …',
  poster_path: '/alien.jpg',
};

describe('createTmdbClient', () => {
  it('looks up a TMDB id directly', async () => {
    const tmdb = fakeTmdb({ '/3/movie/348@de-DE': ALIEN });
    const client = createTmdbClient('v3key', tmdb.fetchImpl);

    const details = await client.lookup({ source: 'tmdb', kind: 'movie', id: 348 }, 'de-DE');

    expect(details).toEqual({
      title: 'Alien',
      year: 1979,
      overview: 'Die Crew der Nostromo …',
      posterUrl: 'https://image.tmdb.org/t/p/w342/alien.jpg',
    });
    expect(tmdb.requests).toHaveLength(1);
  });

  it('translates an IMDb id through the find endpoint', async () => {
    const tmdb = fakeTmdb({
      '/3/find/tt0078748': { movie_results: [{ id: 348 }], tv_results: [] },
      '/3/movie/348@de-DE': ALIEN,
    });
    const client = createTmdbClient('v3key', tmdb.fetchImpl);

    const details = await client.lookup({ source: 'imdb', id: 'tt0078748' }, 'de-DE');

    expect(details?.title).toBe('Alien');
    expect(tmdb.requests[0]?.url.searchParams.get('external_source')).toBe('imdb_id');
  });

  it('borrows the English plot when the asked-for language has none', async () => {
    const tmdb = fakeTmdb({
      '/3/tv/1399@de-DE': { name: 'Game of Thrones', first_air_date: '2011-04-17', overview: '' },
      '/3/tv/1399@en-US': { name: 'Game of Thrones', overview: 'Seven noble families…' },
    });
    const client = createTmdbClient('v3key', tmdb.fetchImpl);

    const details = await client.lookup({ source: 'tmdb', kind: 'tv', id: 1399 }, 'de-DE');

    expect(details).toMatchObject({ year: 2011, overview: 'Seven noble families…' });
  });

  it('sends a v3 key as a query parameter', async () => {
    const tmdb = fakeTmdb({ '/3/movie/348@de-DE': ALIEN });
    await createTmdbClient('v3key', tmdb.fetchImpl).lookup(
      { source: 'tmdb', kind: 'movie', id: 348 },
      'de-DE',
    );

    expect(tmdb.requests[0]?.url.searchParams.get('api_key')).toBe('v3key');
    expect(tmdb.requests[0]?.headers['Authorization']).toBeUndefined();
  });

  it('sends a v4 read access token as a bearer token', async () => {
    const tmdb = fakeTmdb({ '/3/movie/348@de-DE': ALIEN });
    await createTmdbClient('eyJhbGciOiJIUzI1NiJ9.e30.sig', tmdb.fetchImpl).lookup(
      { source: 'tmdb', kind: 'movie', id: 348 },
      'de-DE',
    );

    expect(tmdb.requests[0]?.url.searchParams.has('api_key')).toBe(false);
    expect(tmdb.requests[0]?.headers['Authorization']).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig');
  });

  it('answers null for an unknown title', async () => {
    const tmdb = fakeTmdb({ '/3/find/tt0000001': { movie_results: [], tv_results: [] } });
    const client = createTmdbClient('v3key', tmdb.fetchImpl);

    expect(await client.lookup({ source: 'imdb', id: 'tt0000001' }, 'de-DE')).toBeNull();
    expect(await client.lookup({ source: 'tmdb', kind: 'movie', id: 1 }, 'de-DE')).toBeNull();
  });

  it('answers null when TMDB cannot be reached', async () => {
    const client = createTmdbClient('v3key', async () => {
      throw new Error('offline');
    });

    expect(await client.lookup({ source: 'tmdb', kind: 'movie', id: 348 }, 'de-DE')).toBeNull();
  });
});
