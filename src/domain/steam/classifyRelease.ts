import { parseSteamReleaseDate } from './parseReleaseDate.ts';

export type ReleaseClassification =
  | { readonly kind: 'released' }
  | { readonly kind: 'scheduled'; readonly date: Temporal.PlainDate }
  | { readonly kind: 'pending' };

export const classifyRelease = (
  comingSoon: boolean,
  releaseDateText: string,
  today: Temporal.PlainDate,
): ReleaseClassification => {
  if (!comingSoon) {
    return { kind: 'released' };
  }

  const parsed = parseSteamReleaseDate(releaseDateText);
  if (parsed === null) {
    return { kind: 'pending' };
  }

  return Temporal.PlainDate.compare(parsed, today) <= 0
    ? { kind: 'released' }
    : { kind: 'scheduled', date: parsed };
};
