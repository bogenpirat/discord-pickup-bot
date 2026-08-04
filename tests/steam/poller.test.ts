import type { Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { SteamClient } from '../../src/steam/client.ts';
import { startSteamWatchPoller } from '../../src/steam/poller.ts';
import { createTestContext } from '../helpers/fakes.ts';

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
