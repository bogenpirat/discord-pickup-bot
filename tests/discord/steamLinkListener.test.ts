import type { Message } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createSteamLinkListener } from '../../src/discord/steamLinkListener.ts';
import type { SteamClient } from '../../src/steam/client.ts';
import { createTestContext } from '../helpers/fakes.ts';

const GUILD = 'guild-1';
const WATCH_CHANNEL = 'channel-1';
const APP_ID = 1245620;

const fakeMessage = (overrides: Partial<Record<string, unknown>> = {}): Message =>
  ({
    id: 'message-1',
    guildId: GUILD,
    channelId: WATCH_CHANNEL,
    content: `check this out https://store.steampowered.com/app/${APP_ID}/`,
    author: { bot: false },
    inGuild: () => true,
    ...overrides,
  }) as unknown as Message;

const countingSteamClient = (): { client: SteamClient; calls: number[] } => {
  const calls: number[] = [];
  return {
    calls,
    client: {
      getAppDetails: async (appId) => {
        calls.push(appId);
        return { kind: 'invalid' };
      },
    },
  };
};

describe('createSteamLinkListener', () => {
  it('ignores messages from bots', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();

    await createSteamLinkListener(context, client)(fakeMessage({ author: { bot: true } }));

    expect(calls).toEqual([]);
  });

  it('ignores messages outside a guild', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();

    await createSteamLinkListener(context, client)(fakeMessage({ inGuild: () => false }));

    expect(calls).toEqual([]);
  });

  it('ignores messages when no watch channel is configured', async () => {
    const context = createTestContext();
    const { client, calls } = countingSteamClient();

    await createSteamLinkListener(context, client)(fakeMessage());

    expect(calls).toEqual([]);
  });

  it('ignores messages posted outside the configured watch channel', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();

    await createSteamLinkListener(
      context,
      client,
    )(fakeMessage({ channelId: 'some-other-channel' }));

    expect(calls).toEqual([]);
  });

  it('looks up each distinct steam app id found in the watched channel', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();

    await createSteamLinkListener(
      context,
      client,
    )(
      fakeMessage({
        content:
          'https://store.steampowered.com/app/1245620/ and https://store.steampowered.com/app/1091500/',
      }),
    );

    expect(calls.sort()).toEqual([1091500, 1245620]);
  });
});
