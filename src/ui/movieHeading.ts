import type { PickupMovie } from '../db/repositories/pickupRepository.ts';

/** "Dune: Part Two (2024)", or the bare title when TMDB knows no release date. */
export const movieHeading = (movie: PickupMovie): string =>
  movie.year === null ? movie.title : `${movie.title} (${movie.year})`;
