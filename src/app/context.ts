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
import { createKeyedMutex, type KeyedMutex } from '../lib/mutex.ts';
import type { Logger } from '../logger.ts';

export interface AppContext {
  readonly db: DatabaseSync;
  readonly settings: GuildSettingsRepository;
  readonly pickups: PickupRepository;
  readonly responses: ResponseRepository;
  readonly mutex: KeyedMutex;
  readonly logger: Logger;
  now(): Temporal.Instant;
}

export const createAppContext = (db: DatabaseSync, logger: Logger): AppContext => ({
  db,
  settings: createGuildSettingsRepository(db),
  pickups: createPickupRepository(db),
  responses: createResponseRepository(db),
  mutex: createKeyedMutex(),
  logger,
  now: () => Temporal.Now.instant(),
});
