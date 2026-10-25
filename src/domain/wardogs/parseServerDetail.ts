import { z } from 'zod';

export interface WardogsServer {
  readonly name: string;
  readonly players: number;
  readonly maxPlayers: number;
  readonly map: string;
  readonly world: string;
  readonly sky: string;
  /** Epoch ms the current round started, or null when the server does not report one. */
  readonly matchStart: number | null;
  readonly passworded: boolean;
  readonly imageUrl: string | null;
}

export interface LiveServerDetail {
  readonly kind: 'live';
  readonly server: WardogsServer;
  /** When the site last polled the server, if it says. */
  readonly updatedAt: Temporal.Instant | null;
  /** The site's own key for the server, e.g. `eu-central|<slug>`; what its pages and banner use. */
  readonly linkKey: string | null;
}

export type ServerDetailResult =
  | LiveServerDetail
  /** Known to the site, but not currently listed by the game. */
  | { readonly kind: 'offline' }
  | { readonly kind: 'invalid' };

const liveSchema = z.object({
  name: z.string(),
  players: z.number(),
  maxPlayers: z.number(),
  map: z.string(),
  world: z.string(),
  sky: z.string(),
  matchStart: z.number().nullish(),
  passworded: z.boolean().nullish(),
  imageUrl: z.string().nullish(),
  linkKey: z.string().nullish(),
});

const responseSchema = z.object({
  updatedAt: z.string().nullish(),
  linkKey: z.string().nullish(),
  live: liveSchema.nullish(),
});

const nonEmpty = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value.trim() === '' ? null : value;

const parseInstant = (value: string | null | undefined): Temporal.Instant | null => {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return Temporal.Instant.from(value);
  } catch {
    return null;
  }
};

export const parseServerDetailResponse = (raw: unknown): ServerDetailResult => {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'invalid' };
  }

  const { live, updatedAt, linkKey } = parsed.data;
  if (live === null || live === undefined) {
    return { kind: 'offline' };
  }

  return {
    kind: 'live',
    updatedAt: parseInstant(updatedAt),
    linkKey: nonEmpty(linkKey) ?? nonEmpty(live.linkKey),
    server: {
      name: live.name,
      players: live.players,
      maxPlayers: live.maxPlayers,
      map: live.map,
      world: live.world,
      sky: live.sky,
      matchStart: live.matchStart ?? null,
      passworded: live.passworded ?? false,
      imageUrl: nonEmpty(live.imageUrl),
    },
  };
};

/** Observed rounds run up to about four hours; anything past a day is a stale stamp. */
const MAX_PLAUSIBLE_ROUND_MS = 24 * 60 * 60 * 1000;

/**
 * How long the current round has been running, or null when `matchStart` cannot
 * honestly say: absent, in the future, or too old to be the round in progress.
 */
export const roundElapsedMs = (matchStart: number | null, nowMs: number): number | null => {
  if (matchStart === null) {
    return null;
  }
  const elapsed = nowMs - matchStart;
  return elapsed < 0 || elapsed > MAX_PLAUSIBLE_ROUND_MS ? null : elapsed;
};
