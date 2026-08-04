import type { DatabaseSync } from 'node:sqlite';
import {
  createGuildSettingsRepository,
  type GuildSettingsRepository,
} from '../db/repositories/guildSettingsRepository.ts';
import {
  createPickupRepository,
  type PickupRepository,
} from '../db/repositories/pickupRepository.ts';
import {
  createResponseRepository,
  type ResponseRepository,
} from '../db/repositories/responseRepository.ts';
import {
  createSteamWatchRepository,
  type SteamWatchRepository,
} from '../db/repositories/steamWatchRepository.ts';
import { createKeyedMutex, type KeyedMutex } from '../lib/mutex.ts';
import type { Logger } from '../logger.ts';

export interface AppContext {
  readonly db: DatabaseSync;
  readonly settings: GuildSettingsRepository;
  readonly pickups: PickupRepository;
  readonly responses: ResponseRepository;
  readonly steamWatches: SteamWatchRepository;
  readonly mutex: KeyedMutex;
  readonly logger: Logger;
  readonly powerUserIds: readonly string[];
  now(): Temporal.Instant;
}

export const createAppContext = (
  db: DatabaseSync,
  logger: Logger,
  powerUserIds: readonly string[] = [],
): AppContext => ({
  db,
  settings: createGuildSettingsRepository(db),
  pickups: createPickupRepository(db),
  responses: createResponseRepository(db),
  steamWatches: createSteamWatchRepository(db),
  mutex: createKeyedMutex(),
  logger,
  powerUserIds,
  now: () => Temporal.Now.instant(),
});
