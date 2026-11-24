/**
 * A film or series named by its page on TMDB or IMDb. TMDB pages name their
 * own id; an IMDb id has to be translated through TMDB's find endpoint first.
 */
export type MovieRef =
  | { readonly source: 'tmdb'; readonly kind: 'movie' | 'tv'; readonly id: number }
  | { readonly source: 'imdb'; readonly id: string };

export interface FoundMovieLink {
  readonly ref: MovieRef;
  /** The page the link points at, rebuilt without tracking parameters or locale prefixes. */
  readonly url: string;
  /** What is left of the text once the link is taken out. */
  readonly remainder: string;
}

// The optional angle brackets are Discord's way of posting a link without a
// preview, so they belong to the link and leave with it.
const TMDB_LINK = /<?(?:https?:\/\/)?(?:www\.)?themoviedb\.org\/(movie|tv)\/(\d+)(?:[^\s>]*)>?/i;
const IMDB_LINK =
  /<?(?:https?:\/\/)?(?:www\.|m\.)?imdb\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?title\/(tt\d{5,10})(?:[^\s>]*)>?/i;

const withoutMatch = (text: string, match: RegExpExecArray): string =>
  `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();

/** The first TMDB or IMDb title link in the text, or null when there is none. */
export const findMovieLink = (text: string): FoundMovieLink | null => {
  const tmdb = TMDB_LINK.exec(text);
  const imdb = IMDB_LINK.exec(text);

  if (tmdb !== null && (imdb === null || tmdb.index <= imdb.index)) {
    const kind = tmdb[1]?.toLowerCase() === 'tv' ? 'tv' : 'movie';
    const id = Number(tmdb[2]);
    return {
      ref: { source: 'tmdb', kind, id },
      url: `https://www.themoviedb.org/${kind}/${id}`,
      remainder: withoutMatch(text, tmdb),
    };
  }

  if (imdb !== null) {
    const id = String(imdb[1]).toLowerCase();
    return {
      ref: { source: 'imdb', id },
      url: `https://www.imdb.com/title/${id}/`,
      remainder: withoutMatch(text, imdb),
    };
  }

  return null;
};
