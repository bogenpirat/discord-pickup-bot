import { describe, expect, it } from 'vitest';
import { parseTmdbFind, parseTmdbTitle } from '../../../src/domain/movies/parseTmdb.ts';

describe('parseTmdbTitle', () => {
  it('reads a film', () => {
    expect(
      parseTmdbTitle({
        id: 693134,
        title: 'Dune: Part Two',
        release_date: '2024-02-27',
        overview: 'Follow the mythic journey of Paul Atreides.',
        poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      }),
    ).toEqual({
      title: 'Dune: Part Two',
      year: 2024,
      overview: 'Follow the mythic journey of Paul Atreides.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    });
  });

  it('reads a series by its name and first air date', () => {
    expect(
      parseTmdbTitle({ name: 'Game of Thrones', first_air_date: '2011-04-17', overview: 'x' }),
    ).toMatchObject({ title: 'Game of Thrones', year: 2011 });
  });

  it('turns what TMDB leaves blank into nothing', () => {
    expect(
      parseTmdbTitle({ title: 'Unreleased', release_date: '', overview: '  ', poster_path: null }),
    ).toEqual({ title: 'Unreleased', year: null, overview: null, posterUrl: null });
  });

  it.each([null, 'nope', {}, { title: '' }, { status_code: 34, success: false }])(
    'finds no title in %j',
    (body) => {
      expect(parseTmdbTitle(body)).toBeNull();
    },
  );
});

describe('parseTmdbFind', () => {
  it('prefers a film over a series', () => {
    expect(parseTmdbFind({ movie_results: [{ id: 348 }], tv_results: [{ id: 1 }] })).toEqual({
      kind: 'movie',
      id: 348,
    });
  });

  it('falls back to a series', () => {
    expect(parseTmdbFind({ movie_results: [], tv_results: [{ id: 1399 }] })).toEqual({
      kind: 'tv',
      id: 1399,
    });
  });

  it.each([null, {}, { movie_results: [], tv_results: [] }])('finds nothing in %j', (body) => {
    expect(parseTmdbFind(body)).toBeNull();
  });
});
