import type { Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { SteamClient } from '../../src/steam/client.ts';
import { startSteamWatchPoller } from '../../src/steam/poller.ts';
import { createTestContext, recordingLogger } from '../helpers/fakes.ts';

const GUILD = 'guild-1';
const CHANNEL = 'channel-1';
const NOW = Temporal.Instant.from('2026-08-04T12:00:00Z');

const fakeDiscordClient = (): Client =>
  ({ channels: { fetch: async () => null } }) as unknown as Client;

const seedWatch = (
  context: ReturnType<typeof createTestContext>,
  appId: number,
  nextCheckAt: number,
) =>
  context.steamWatches.create({
    guildId: GUILD,
    channelId: CHANNEL,
    messageId: `message-${appId}`,
    appId,
    gameName: `Game ${appId}`,
    status: 'pending',
    releaseDate: null,
    releaseDateText: null,
    nextCheckAt,
  });

describe('startSteamWatchPoller logging', () => {
  it('lists every tracked game when it boots up', () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };
    seedWatch(context, 1, NOW.epochMilliseconds + 1000);
    seedWatch(context, 2, NOW.epochMilliseconds + 2000);

    const steamClient: SteamClient = { getAppDetails: async () => ({ kind: 'error' }) };
    startSteamWatchPoller(context, fakeDiscordClient(), steamClient).stop();

    const started = log.find('steam watch poller started');
    expect(started?.fields).toMatchObject({ tracked: 2, intervalMinutes: 60 });
    expect(
      log.records
        .filter((entry) => entry.message === 'watching steam game for release')
        .map((entry) => entry.fields['game']),
    ).toEqual(['Game 1', 'Game 2']);
  });

  it('summarises each tick, counting how every due game turned out', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };
    seedWatch(context, 1, NOW.epochMilliseconds - 1000);
    seedWatch(context, 2, NOW.epochMilliseconds - 1000);

    const steamClient: SteamClient = {
      getAppDetails: async (appId) => {
        if (appId === 1) {
          throw new Error('boom');
        }
        return { kind: 'error' };
      },
    };

    const poller = startSteamWatchPoller(context, fakeDiscordClient(), steamClient);
    try {
      await poller.runNow();
    } finally {
      poller.stop();
    }

    expect(log.find('steam watch tick started')?.fields).toMatchObject({ due: 2 });
    expect(log.find('steam watch tick finished')?.fields).toMatchObject({
      checked: 2,
      failed: 1,
      'lookup-failed': 1,
      released: 0,
      remaining: 2,
    });
  });

  it('stays quiet on info level when no game is due', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };
    seedWatch(context, 1, NOW.epochMilliseconds + 60_000);

    const steamClient: SteamClient = { getAppDetails: async () => ({ kind: 'error' }) };
    const poller = startSteamWatchPoller(context, fakeDiscordClient(), steamClient);
    log.records.length = 0;
    try {
      await poller.runNow();
    } finally {
      poller.stop();
    }

    expect(log.messages('info')).toEqual([]);
    expect(log.messages('debug')).toContain('steam watch tick: no game is due for a check');
  });
});

describe('startSteamWatchPoller', () => {
  it('processes only rows that are due', async () => {
    const context = createTestContext(NOW);
    seedWatch(context, 1, NOW.epochMilliseconds - 1000); // due
    seedWatch(context, 2, NOW.epochMilliseconds + 1000 * 60 * 60 * 24); // not due

    const calls: number[] = [];
    const steamClient: SteamClient = {
      getAppDetails: async (appId) => {
        calls.push(appId);
        return { kind: 'error' };
      },
    };

    const poller = startSteamWatchPoller(context, fakeDiscordClient(), steamClient);
    try {
      await poller.runNow();
    } finally {
      poller.stop();
    }

    expect(calls).toEqual([1]);
  });

  it('continues processing the rest of the batch when one entry throws', async () => {
    const context = createTestContext(NOW);
    seedWatch(context, 1, NOW.epochMilliseconds - 1000);
    seedWatch(context, 2, NOW.epochMilliseconds - 1000);

    const calls: number[] = [];
    const steamClient: SteamClient = {
      getAppDetails: async (appId) => {
        calls.push(appId);
        if (appId === 1) {
          throw new Error('boom');
        }
        return { kind: 'error' };
      },
    };

    const poller = startSteamWatchPoller(context, fakeDiscordClient(), steamClient);
    try {
      await poller.runNow();
    } finally {
      poller.stop();
    }

    expect(calls).toEqual([1, 2]);
  });

  it('runs a tick automatically once the interval elapses', async () => {
    vi.useFakeTimers();
    try {
      const context = createTestContext(NOW);
      seedWatch(context, 1, NOW.epochMilliseconds - 1000);

      let calls = 0;
      const steamClient: SteamClient = {
        getAppDetails: async () => {
          calls += 1;
          return { kind: 'error' };
        },
      };

      const poller = startSteamWatchPoller(context, fakeDiscordClient(), steamClient, 1000);
      await vi.advanceTimersByTimeAsync(1000);
      poller.stop();

      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() clears the underlying interval', () => {
    const context = createTestContext(NOW);
    const steamClient: SteamClient = { getAppDetails: async () => ({ kind: 'error' }) };
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const poller = startSteamWatchPoller(context, fakeDiscordClient(), steamClient, 10);
    poller.stop();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
