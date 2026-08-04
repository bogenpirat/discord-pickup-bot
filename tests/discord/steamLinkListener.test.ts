import type { Message } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createSteamLinkListener } from '../../src/discord/steamLinkListener.ts';
import type { SteamClient } from '../../src/steam/client.ts';
import { createTestContext } from '../helpers/fakes.ts';

const GUILD = 'guild-1';
const WATCH_CHANNEL = 'channel-1';
const APP_ID = 1245620;

const fakeMessage = (
  overrides: Partial<Record<string, unknown>> = {},
): { message: Message; reactions: string[] } => {
  const reactions: string[] = [];
  const message = {
    id: 'message-1',
    guildId: GUILD,
    channelId: WATCH_CHANNEL,
    content: `check this out https://store.steampowered.com/app/${APP_ID}/`,
    author: { bot: false },
    inGuild: () => true,
    react: async (emoji: string) => {
      reactions.push(emoji);
    },
    ...overrides,
  } as unknown as Message;

  return { message, reactions };
};

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

const pendingSteamClient = (): SteamClient => ({
  getAppDetails: async (appId) => ({
    kind: 'found',
    details: {
      appId,
      name: `Game ${appId}`,
      headerImage: 'https://cdn.example.com/header.jpg',
      comingSoon: true,
      releaseDateText: 'Q2 2026',
      price: null,
      storeUrl: `https://store.steampowered.com/app/${appId}`,
    },
  }),
});

describe('createSteamLinkListener', () => {
  it('ignores messages from bots', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();
    const { message } = fakeMessage({ author: { bot: true } });

    await createSteamLinkListener(context, client)(message);

    expect(calls).toEqual([]);
  });

  it('ignores messages outside a guild', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();
    const { message } = fakeMessage({ inGuild: () => false });

    await createSteamLinkListener(context, client)(message);

    expect(calls).toEqual([]);
  });

  it('ignores messages when no watch channel is configured', async () => {
    const context = createTestContext();
    const { client, calls } = countingSteamClient();
    const { message } = fakeMessage();

    await createSteamLinkListener(context, client)(message);

    expect(calls).toEqual([]);
  });

  it('ignores messages posted outside the configured watch channel', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();
    const { message } = fakeMessage({ channelId: 'some-other-channel' });

    await createSteamLinkListener(context, client)(message);

    expect(calls).toEqual([]);
  });

  it('looks up each distinct steam app id found in the watched channel', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client, calls } = countingSteamClient();
    const { message } = fakeMessage({
      content:
        'https://store.steampowered.com/app/1245620/ and https://store.steampowered.com/app/1091500/',
    });

    await createSteamLinkListener(context, client)(message);

    expect(calls.sort()).toEqual([1091500, 1245620]);
  });

  it('reacts with the eyes emoji when it starts watching a game', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { message, reactions } = fakeMessage();

    await createSteamLinkListener(context, pendingSteamClient())(message);

    expect(reactions).toEqual(['👀']);
  });

  it('reacts only once even when several links start watches in the same message', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { message, reactions } = fakeMessage({
      content:
        'https://store.steampowered.com/app/1245620/ and https://store.steampowered.com/app/1091500/',
    });

    await createSteamLinkListener(context, pendingSteamClient())(message);

    expect(reactions).toEqual(['👀']);
  });

  it('does not react when every link is disregarded', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { client } = countingSteamClient();
    const { message, reactions } = fakeMessage();

    await createSteamLinkListener(context, client)(message);

    expect(reactions).toEqual([]);
  });

  it('does not throw when reacting fails, and logs a warning instead', async () => {
    const context = createTestContext();
    context.settings.setSteamWatchChannel(GUILD, WATCH_CHANNEL);
    const { message } = fakeMessage({
      react: async () => {
        throw new Error('missing permission');
      },
    });

    await expect(
      createSteamLinkListener(context, pendingSteamClient())(message),
    ).resolves.toBeUndefined();
  });
});
