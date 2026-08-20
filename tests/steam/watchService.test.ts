import type { Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { SteamAppDetails } from '../../src/domain/steam/parseAppDetails.ts';
import type { SteamClient, SteamLookupResult } from '../../src/steam/client.ts';
import { processDueWatch, recordDetectedGame } from '../../src/steam/watchService.ts';
import { createTestContext, recordingLogger } from '../helpers/fakes.ts';

const APP_ID = 1245620;
const GUILD = 'guild-1';
const CHANNEL = 'channel-1';
const MESSAGE = 'message-1';
const NOW = Temporal.Instant.from('2026-08-04T12:00:00Z');

const details = (overrides: Partial<SteamAppDetails> = {}): SteamAppDetails => ({
  appId: APP_ID,
  name: 'ELDEN RING',
  headerImage: 'https://cdn.example.com/header.jpg',
  comingSoon: true,
  releaseDateText: 'Q2 2026',
  price: null,
  storeUrl: `https://store.steampowered.com/app/${APP_ID}`,
  ...overrides,
});

const fakeSteamClient = (result: SteamLookupResult): SteamClient => ({
  getAppDetails: async () => result,
});

interface FakeChannel {
  isTextBased(): boolean;
  isSendable(): boolean;
  send(payload: unknown): Promise<unknown>;
}

const fakeDiscordClient = (channel: FakeChannel | null): Client =>
  ({
    channels: { fetch: async () => channel },
  }) as unknown as Client;

const sendableChannel = (sent: unknown[], fails = false): FakeChannel => ({
  isTextBased: () => true,
  isSendable: () => true,
  send: async (payload) => {
    if (fails) {
      throw new Error('send failed');
    }
    sent.push(payload);
    return { id: 'announcement-1' };
  },
});

const detectInput = { guildId: GUILD, channelId: CHANNEL, messageId: MESSAGE, appId: APP_ID };

describe('recordDetectedGame', () => {
  it('disregards an already-released game without persisting anything', async () => {
    const context = createTestContext(NOW);
    const started = await recordDetectedGame(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      detectInput,
    );
    expect(started).toBe(false);
    expect(context.steamWatches.findByGuildAndApp(GUILD, APP_ID)).toBeUndefined();
  });

  it('disregards an invalid app id without persisting anything', async () => {
    const context = createTestContext(NOW);
    const started = await recordDetectedGame(
      context,
      fakeSteamClient({ kind: 'invalid' }),
      detectInput,
    );
    expect(started).toBe(false);
    expect(context.steamWatches.findByGuildAndApp(GUILD, APP_ID)).toBeUndefined();
  });

  it('persists a placeholder pending row on a transient fetch error, retried within an hour', async () => {
    const context = createTestContext(NOW);
    const started = await recordDetectedGame(
      context,
      fakeSteamClient({ kind: 'error' }),
      detectInput,
    );
    expect(started).toBe(true);

    const row = context.steamWatches.findByGuildAndApp(GUILD, APP_ID);
    expect(row?.status).toBe('pending');
    expect(row?.gameName).toBe(`Steam App ${APP_ID}`);
    expect(row?.releaseDateText).toBeNull();
    expect(row?.nextCheckAt).toBe(NOW.add({ hours: 1 }).epochMilliseconds);
  });

  it('persists a scheduled row for a concrete future date', async () => {
    const context = createTestContext(NOW);
    const started = await recordDetectedGame(
      context,
      fakeSteamClient({ kind: 'found', details: details({ releaseDateText: '14 Aug, 2026' }) }),
      detectInput,
    );
    expect(started).toBe(true);

    const row = context.steamWatches.findByGuildAndApp(GUILD, APP_ID);
    expect(row?.status).toBe('scheduled');
    expect(row?.gameName).toBe('ELDEN RING');
    expect(row?.releaseDate).not.toBeNull();
  });

  it('persists a pending row for an unparseable date, rechecked in a week', async () => {
    const context = createTestContext(NOW);
    const started = await recordDetectedGame(
      context,
      fakeSteamClient({ kind: 'found', details: details({ releaseDateText: 'Q2 2026' }) }),
      detectInput,
    );
    expect(started).toBe(true);

    const row = context.steamWatches.findByGuildAndApp(GUILD, APP_ID);
    expect(row?.status).toBe('pending');
    expect(row?.nextCheckAt).toBe(NOW.add({ hours: 24 * 7 }).epochMilliseconds);
  });

  it('is a no-op when the guild+app is already tracked', async () => {
    const context = createTestContext(NOW);
    const steamClient = fakeSteamClient({
      kind: 'found',
      details: details({ releaseDateText: 'Q2 2026' }),
    });
    await recordDetectedGame(context, steamClient, detectInput);
    const first = context.steamWatches.findByGuildAndApp(GUILD, APP_ID);

    const startedAgain = await recordDetectedGame(context, steamClient, {
      ...detectInput,
      messageId: 'message-2',
    });
    const second = context.steamWatches.findByGuildAndApp(GUILD, APP_ID);

    expect(startedAgain).toBe(false);
    expect(second?.messageId).toBe(first?.messageId);
    expect(context.steamWatches.listByGuild(GUILD)).toHaveLength(1);
  });
});

describe('processDueWatch', () => {
  it('removes the row when the app id has become invalid', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'Some Game',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'invalid' }),
      fakeDiscordClient(null),
      row,
    );

    expect(context.steamWatches.findById(row.id)).toBeUndefined();
  });

  it('leaves the row untouched on a transient fetch error', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'Some Game',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'error' }),
      fakeDiscordClient(null),
      row,
    );

    expect(context.steamWatches.findById(row.id)).toEqual(row);
  });

  it('announces and removes the row when the game is now released', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'scheduled',
      releaseDate: NOW.epochMilliseconds,
      releaseDateText: '4 Aug, 2026',
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    const sent: unknown[] = [];
    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(sendableChannel(sent)),
      row,
    );

    expect(sent).toHaveLength(1);
    const payload = sent[0] as { reply: { messageReference: string } };
    expect(payload.reply.messageReference).toBe(MESSAGE);
    expect(context.steamWatches.findById(row.id)).toBeUndefined();
  });

  it('announces when a pending row turns out already released on recheck (case 3)', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    const sent: unknown[] = [];
    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(sendableChannel(sent)),
      row,
    );

    expect(sent).toHaveLength(1);
    expect(context.steamWatches.findById(row.id)).toBeUndefined();
  });

  it('reschedules a still-pending row another week out and refreshes the name', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'Old Name',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({
        kind: 'found',
        details: details({ name: 'New Name', releaseDateText: 'Q3 2026' }),
      }),
      fakeDiscordClient(null),
      row,
    );

    const updated = context.steamWatches.findById(row.id);
    expect(updated?.status).toBe('pending');
    expect(updated?.gameName).toBe('New Name');
    expect(updated?.nextCheckAt).toBe(NOW.add({ hours: 24 * 7 }).epochMilliseconds);
  });

  it('moves a pending row to scheduled once a firm date appears, matching direct-scheduled state', async () => {
    const context = createTestContext(NOW);
    const pendingId = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: NOW.epochMilliseconds,
    });
    const pendingRow = context.steamWatches.findById(pendingId as number);
    if (pendingRow === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ releaseDateText: '14 Aug, 2026' }) }),
      fakeDiscordClient(null),
      pendingRow,
    );

    const recheckedRow = context.steamWatches.findById(pendingRow.id);

    const directContext = createTestContext(NOW);
    directContext.steamWatches.create({
      guildId: 'guild-2',
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'scheduled',
      releaseDate: recheckedRow?.releaseDate ?? null,
      releaseDateText: '14 Aug, 2026',
      nextCheckAt: recheckedRow?.nextCheckAt ?? 0,
    });
    const directRow = directContext.steamWatches.findByGuildAndApp('guild-2', APP_ID);

    expect(recheckedRow?.status).toBe(directRow?.status);
    expect(recheckedRow?.releaseDate).toBe(directRow?.releaseDate);
    expect(recheckedRow?.nextCheckAt).toBe(directRow?.nextCheckAt);
  });

  it('reschedules a scheduled row when the release date is delayed', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'scheduled',
      releaseDate: NOW.epochMilliseconds,
      releaseDateText: '4 Aug, 2026',
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ releaseDateText: '1 Dec, 2026' }) }),
      fakeDiscordClient(null),
      row,
    );

    const updated = context.steamWatches.findById(row.id);
    expect(updated?.status).toBe('scheduled');
    expect(updated?.releaseDate).not.toBe(row.releaseDate);
  });

  it('reschedules for a retry when the announce channel is unavailable, without removing the row', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'scheduled',
      releaseDate: NOW.epochMilliseconds,
      releaseDateText: '4 Aug, 2026',
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(null),
      row,
    );

    const updated = context.steamWatches.findById(row.id);
    expect(updated).toBeDefined();
    expect(updated?.nextCheckAt).toBe(NOW.add({ hours: 1 }).epochMilliseconds);
  });

  it('reschedules for a retry when sending the announcement throws, without removing the row', async () => {
    const context = createTestContext(NOW);
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'scheduled',
      releaseDate: NOW.epochMilliseconds,
      releaseDateText: '4 Aug, 2026',
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');

    await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(sendableChannel([], true)),
      row,
    );

    const updated = context.steamWatches.findById(row.id);
    expect(updated).toBeDefined();
    expect(updated?.nextCheckAt).toBe(NOW.add({ hours: 1 }).epochMilliseconds);
  });
});

describe('steam watch logging', () => {
  const seedRow = (context: ReturnType<typeof createTestContext>) => {
    const id = context.steamWatches.create({
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      appId: APP_ID,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: 'Q2 2026',
      nextCheckAt: NOW.epochMilliseconds,
    });
    const row = context.steamWatches.findById(id as number);
    if (row === undefined) throw new Error('setup failed');
    return row;
  };

  it('logs the game it starts watching', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };

    await recordDetectedGame(
      context,
      fakeSteamClient({ kind: 'found', details: details({ releaseDateText: '1 Sep, 2026' }) }),
      detectInput,
    );

    expect(log.find('now watching steam game for release')?.fields).toMatchObject({
      appId: APP_ID,
      game: 'ELDEN RING',
      status: 'scheduled',
      releaseDateText: '1 Sep, 2026',
    });
  });

  it('logs a status line for a game that is still without a release date', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details() }),
      fakeDiscordClient(null),
      seedRow(context),
    );

    expect(outcome).toBe('pending');
    expect(log.find('steam game still unreleased, no release date yet')?.fields).toMatchObject({
      game: 'ELDEN RING',
      status: 'pending',
      nextCheckAt: NOW.add({ hours: 24 * 7 }).toString(),
    });
  });

  it('logs a status line with the date once one is known', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ releaseDateText: '1 Sep, 2026' }) }),
      fakeDiscordClient(null),
      seedRow(context),
    );

    expect(outcome).toBe('scheduled');
    expect(log.find('steam game still unreleased, release date known')?.fields).toMatchObject({
      status: 'scheduled',
      releaseDateText: '1 Sep, 2026',
    });
  });

  it('logs the release once the announcement has been posted', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };
    const sent: unknown[] = [];

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(sendableChannel(sent)),
      seedRow(context),
    );

    expect(outcome).toBe('released');
    expect(
      log.find('steam game released, announced in channel and stopped watching')?.fields,
    ).toMatchObject({ appId: APP_ID, game: 'ELDEN RING', channelId: CHANNEL });
  });

  it('does not count a release as announced when the channel is gone', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };
    const row = seedRow(context);

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(null),
      row,
    );

    expect(outcome).toBe('announce-failed');
    expect(log.find('steam watch channel unavailable, retrying later')?.level).toBe('warn');
    expect(context.steamWatches.findById(row.id)).toBeDefined();
  });

  it('does not count a release as announced when sending throws', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'found', details: details({ comingSoon: false }) }),
      fakeDiscordClient(sendableChannel([], true)),
      seedRow(context),
    );

    expect(outcome).toBe('announce-failed');
    expect(
      log.find('failed to send steam release announcement, retrying later')?.fields,
    ).toMatchObject({ game: 'ELDEN RING' });
  });

  it('warns, and keeps the schedule, when the steam lookup fails', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'error' }),
      fakeDiscordClient(null),
      seedRow(context),
    );

    expect(outcome).toBe('lookup-failed');
    const warning = log.find('steam lookup failed, keeping the existing schedule');
    expect(warning?.level).toBe('warn');
    expect(warning?.fields).toMatchObject({ appId: APP_ID, game: 'ELDEN RING' });
  });

  it('warns when a watched app disappears from steam', async () => {
    const log = recordingLogger();
    const context = { ...createTestContext(NOW), logger: log.logger };

    const outcome = await processDueWatch(
      context,
      fakeSteamClient({ kind: 'invalid' }),
      fakeDiscordClient(null),
      seedRow(context),
    );

    expect(outcome).toBe('unavailable');
    expect(log.find('steam app no longer available, stopped watching')?.level).toBe('warn');
  });
});
