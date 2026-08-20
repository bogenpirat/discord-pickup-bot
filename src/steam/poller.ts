import type { Client } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { SteamClient } from './client.ts';
import { describeWatch } from './watchLog.ts';
import { processDueWatch, type WatchCheckOutcome } from './watchService.ts';

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_LIMIT = 25;

export interface SteamWatchPoller {
  runNow(): Promise<void>;
  stop(): void;
}

type TickTally = Record<WatchCheckOutcome | 'failed', number>;

const emptyTally = (): TickTally => ({
  released: 0,
  'announce-failed': 0,
  scheduled: 0,
  pending: 0,
  unavailable: 0,
  'lookup-failed': 0,
  failed: 0,
});

const logTrackedGames = (context: AppContext, intervalMs: number): void => {
  const tracked = context.steamWatches.listAll();
  context.logger.info(
    { tracked: tracked.length, intervalMinutes: Math.round(intervalMs / 60_000) },
    'steam watch poller started',
  );
  for (const row of tracked) {
    context.logger.info(describeWatch(row), 'watching steam game for release');
  }
};

export const startSteamWatchPoller = (
  context: AppContext,
  discordClient: Client,
  steamClient: SteamClient,
  intervalMs = TICK_INTERVAL_MS,
): SteamWatchPoller => {
  logTrackedGames(context, intervalMs);

  const runNow = async (): Promise<void> => {
    const due = context.steamWatches.findDue(context.now().epochMilliseconds, BATCH_LIMIT);
    if (due.length === 0) {
      context.logger.debug('steam watch tick: no game is due for a check');
      return;
    }

    context.logger.info({ due: due.length }, 'steam watch tick started');
    const tally = emptyTally();

    for (const row of due) {
      try {
        tally[await processDueWatch(context, steamClient, discordClient, row)] += 1;
      } catch (error) {
        tally.failed += 1;
        context.logger.error({ err: error, watchId: row.id }, 'steam watch tick failed for entry');
      }
    }

    context.logger.info(
      { checked: due.length, ...tally, remaining: context.steamWatches.listAll().length },
      'steam watch tick finished',
    );
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
