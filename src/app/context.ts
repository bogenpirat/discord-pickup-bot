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
  createRiotAccountRepository,
  type RiotAccountRepository,
} from '../db/repositories/riotAccountRepository.ts';
import {
  createSteamWatchRepository,
  type SteamWatchRepository,
} from '../db/repositories/steamWatchRepository.ts';
import { createKeyedMutex, type KeyedMutex } from '../lib/mutex.ts';
import type { Logger } from '../logger.ts';
import type { ValorantClient } from '../valorant/client.ts';

export interface AppContext {
  readonly db: DatabaseSync;
  readonly settings: GuildSettingsRepository;
  readonly pickups: PickupRepository;
  readonly responses: ResponseRepository;
  readonly steamWatches: SteamWatchRepository;
  readonly riotAccounts: RiotAccountRepository;
  readonly mutex: KeyedMutex;
  readonly logger: Logger;
  readonly powerUserIds: readonly string[];
  /** Public origin of the bot's HTTP server, or null when it is not configured. */
  readonly publicBaseUrl: string | null;
  /** The Valorant API client, or null when no API key is configured. */
  readonly valorant: ValorantClient | null;
  now(): Temporal.Instant;
}

export const createAppContext = (
  db: DatabaseSync,
  logger: Logger,
  powerUserIds: readonly string[] = [],
  publicBaseUrl: string | null = null,
  valorant: ValorantClient | null = null,
): AppContext => ({
  db,
  settings: createGuildSettingsRepository(db),
  pickups: createPickupRepository(db),
  responses: createResponseRepository(db),
  steamWatches: createSteamWatchRepository(db),
  riotAccounts: createRiotAccountRepository(db),
  mutex: createKeyedMutex(),
  logger,
  powerUserIds,
  publicBaseUrl,
  valorant,
  now: () => Temporal.Now.instant(),
});
