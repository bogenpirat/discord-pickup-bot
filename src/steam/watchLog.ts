import type { SteamWatchRecord } from '../db/repositories/steamWatchRepository.ts';
import { DEFAULT_TIME_ZONE } from '../domain/time/timezone.ts';

export interface WatchLogFields {
  readonly watchId: number;
  readonly guildId: string;
  readonly appId: number;
  readonly game: string;
  readonly status: string;
  readonly releaseDate: string | null;
  readonly releaseDateText: string | null;
  readonly nextCheckAt: string;
}

const asDay = (epochMs: number): string =>
  Temporal.Instant.fromEpochMilliseconds(epochMs)
    .toZonedDateTimeISO(DEFAULT_TIME_ZONE)
    .toPlainDate()
    .toString();

const asInstant = (epochMs: number): string =>
  Temporal.Instant.fromEpochMilliseconds(epochMs).toString();

/** Log fields describing what the watcher knows about one game right now. */
export const describeWatch = (row: SteamWatchRecord): WatchLogFields => ({
  watchId: row.id,
  guildId: row.guildId,
  appId: row.appId,
  game: row.gameName,
  status: row.status,
  releaseDate: row.releaseDate === null ? null : asDay(row.releaseDate),
  releaseDateText: row.releaseDateText,
  nextCheckAt: asInstant(row.nextCheckAt),
});
