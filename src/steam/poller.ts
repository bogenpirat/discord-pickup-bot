import type { Client } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { SteamClient } from './client.ts';
import { processDueWatch } from './watchService.ts';

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_LIMIT = 25;

export interface SteamWatchPoller {
  runNow(): Promise<void>;
  stop(): void;
}

export const startSteamWatchPoller = (
  context: AppContext,
  discordClient: Client,
  steamClient: SteamClient,
  intervalMs = TICK_INTERVAL_MS,
): SteamWatchPoller => {
  const runNow = async (): Promise<void> => {
    const due = context.steamWatches.findDue(context.now().epochMilliseconds, BATCH_LIMIT);
    for (const row of due) {
      try {
        await processDueWatch(context, steamClient, discordClient, row);
      } catch (error) {
        context.logger.error({ err: error, watchId: row.id }, 'steam watch tick failed for entry');
      }
    }
  };

  const timer = setInterval(() => {
    void runNow();
  }, intervalMs);
  timer.unref();

  return {
    runNow,
    stop: () => {
      clearInterval(timer);
    },
  };
};
