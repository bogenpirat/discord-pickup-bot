import { z } from 'zod';

/** What a movie night poster shows about its feature. */
export interface MovieDetails {
  readonly title: string;
  readonly year: number | null;
  /** The plot outline, or null when TMDB has none in the asked-for language. */
  readonly overview: string | null;
  readonly posterUrl: string | null;
}

/** w500 is sharp at the size Discord draws an embed's main image, without the weight of the original. */
const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** Release dates come as `YYYY-MM-DD`, or as an empty string when unknown. */
const yearOf = (date: string | null | undefined): number | null => {
  const match = /^(\d{4})-/.exec(date ?? '');
  return match === null ? null : Number(match[1]);
};

const posterUrlOf = (path: string | null | undefined): string | null => {
  const trimmed = blankToNull(path);
  return trimmed === null || !trimmed.startsWith('/') ? null : `${POSTER_BASE_URL}${trimmed}`;
};

// Movies and series name the same things differently; both shapes are taken
// so a TMDB link to a series works as well as one to a film.
const titleSchema = z.object({
  title: z.string().nullish(),
  name: z.string().nullish(),
  release_date: z.string().nullish(),
  first_air_date: z.string().nullish(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
});

type TmdbTitle = z.infer<typeof titleSchema>;

const toDetails = (raw: TmdbTitle): MovieDetails | null => {
  const title = blankToNull(raw.title) ?? blankToNull(raw.name);
  if (title === null) {
    return null;
  }
  return {
    title,
    year: yearOf(raw.release_date) ?? yearOf(raw.first_air_date),
    overview: blankToNull(raw.overview),
    posterUrl: posterUrlOf(raw.poster_path),
  };
};

/** The body of `/movie/{id}` or `/tv/{id}`. Null when it names no title. */
export const parseTmdbTitle = (body: unknown): MovieDetails | null => {
  const parsed = titleSchema.safeParse(body);
  return parsed.success ? toDetails(parsed.data) : null;
};

const findSchema = z.object({
  movie_results: z.array(z.object({ id: z.number() })).nullish(),
  tv_results: z.array(z.object({ id: z.number() })).nullish(),
});

/**
 * The TMDB title an IMDb id stands for, from the body of `/find/{imdb_id}`.
 * A film wins over a series, since a movie night is what asked.
 */
export const parseTmdbFind = (
  body: unknown,
): { readonly kind: 'movie' | 'tv'; readonly id: number } | null => {
  const parsed = findSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const movie = parsed.data.movie_results?.[0];
  if (movie !== undefined) {
    return { kind: 'movie', id: movie.id };
  }
  const tv = parsed.data.tv_results?.[0];
  return tv === undefined ? null : { kind: 'tv', id: tv.id };
};
