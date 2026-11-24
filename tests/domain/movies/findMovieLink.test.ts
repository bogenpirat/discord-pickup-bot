import { describe, expect, it } from 'vitest';
import { findMovieLink } from '../../../src/domain/movies/findMovieLink.ts';

describe('findMovieLink', () => {
  it('reads a TMDB movie link and drops its slug and query', () => {
    expect(
      findMovieLink('https://www.themoviedb.org/movie/693134-dune-part-two?language=de-DE heute'),
    ).toEqual({
      ref: { source: 'tmdb', kind: 'movie', id: 693134 },
      url: 'https://www.themoviedb.org/movie/693134',
      remainder: 'heute',
    });
  });

  it('reads a TMDB series link', () => {
    expect(findMovieLink('themoviedb.org/tv/1399-game-of-thrones')?.ref).toEqual({
      source: 'tmdb',
      kind: 'tv',
      id: 1399,
    });
  });

  it.each([
    'https://www.imdb.com/title/tt15239678/',
    'https://m.imdb.com/title/tt15239678/?ref_=nv_sr_srsg_0',
    'https://www.imdb.com/de/title/tt15239678/',
    'imdb.com/title/tt15239678',
    '<https://www.imdb.com/title/tt15239678/>',
  ])('reads the IMDb id out of %s', (link) => {
    const found = findMovieLink(`Dune ${link} 20 Uhr`);

    expect(found?.ref).toEqual({ source: 'imdb', id: 'tt15239678' });
    expect(found?.url).toBe('https://www.imdb.com/title/tt15239678/');
    expect(found?.remainder).toBe('Dune 20 Uhr');
  });

  it('takes whichever link comes first', () => {
    expect(
      findMovieLink('https://www.imdb.com/title/tt0078748/ https://www.themoviedb.org/movie/348')
        ?.ref,
    ).toEqual({ source: 'imdb', id: 'tt0078748' });
  });

  it('leaves nothing behind when the link was all there was', () => {
    expect(findMovieLink('https://www.themoviedb.org/movie/348')?.remainder).toBe('');
  });

  it.each([
    'Dune um 20 Uhr',
    'https://www.imdb.com/name/nm0000123/',
    'https://letterboxd.com/film/dune-part-two/',
    'https://www.themoviedb.org/person/1190668',
  ])('finds no film in %s', (text) => {
    expect(findMovieLink(text)).toBeNull();
  });
});
