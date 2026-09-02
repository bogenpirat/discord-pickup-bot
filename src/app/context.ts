import type { DatabaseSync } from 'node:sqlite';
import { type AuditTrail, createDisabledAuditTrail } from '../audit/trail.ts';
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
import { type ContentCatalog, createContentCatalog } from '../valorant/contentCatalog.ts';

export interface AppContext {
  readonly db: DatabaseSync;
  readonly settings: GuildSettingsRepository;
  readonly pickups: PickupRepository;
  readonly responses: ResponseRepository;
  readonly steamWatches: SteamWatchRepository;
  readonly riotAccounts: RiotAccountRepository;
  readonly mutex: KeyedMutex;
  readonly logger: Logger;
  /** Records what members trigger. Disabled unless an audit log path is configured. */
  readonly audit: AuditTrail;
  readonly powerUserIds: readonly string[];
  /** Public origin of the bot's HTTP server, or null when it is not configured. */
  readonly publicBaseUrl: string | null;
  /** The Valorant API client, or null when no API key is configured. */
  readonly valorant: ValorantClient | null;
  /**
   * Names for the ids the API answers with. Empty until it has been loaded, and
   * for the whole run when there is no client to load it with.
   */
  readonly content: ContentCatalog;
  now(): Temporal.Instant;
}

export const createAppContext = (
  db: DatabaseSync,
  logger: Logger,
  powerUserIds: readonly string[] = [],
  publicBaseUrl: string | null = null,
  valorant: ValorantClient | null = null,
  audit: AuditTrail = createDisabledAuditTrail(),
): AppContext => ({
  db,
  settings: createGuildSettingsRepository(db),
  pickups: createPickupRepository(db),
  responses: createResponseRepository(db),
  steamWatches: createSteamWatchRepository(db),
  riotAccounts: createRiotAccountRepository(db),
  mutex: createKeyedMutex(),
  logger,
  audit,
  powerUserIds,
  publicBaseUrl,
  valorant,
  // Derived rather than passed in: it needs exactly the client and logger this
  // context already has, and one catalog per context is the point of it.
  content: createContentCatalog({ client: valorant, logger }),
  now: () => Temporal.Now.instant(),
});
