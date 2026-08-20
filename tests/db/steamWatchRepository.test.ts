import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrations.ts';
import { createSteamWatchRepository } from '../../src/db/repositories/steamWatchRepository.ts';

const GUILD = 'guild-1';
const OTHER_GUILD = 'guild-2';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
});

const newWatch = (
  overrides: Partial<{
    guildId: string;
    appId: number;
    nextCheckAt: number;
    gameName: string;
  }> = {},
) =>
  createSteamWatchRepository(db).create({
    guildId: overrides.guildId ?? GUILD,
    channelId: 'channel-1',
    messageId: 'message-1',
    appId: overrides.appId ?? 1245620,
    gameName: overrides.gameName ?? 'ELDEN RING',
    status: 'pending',
    releaseDate: null,
    releaseDateText: null,
    nextCheckAt: overrides.nextCheckAt ?? 1000,
  });

describe('steamWatchRepository', () => {
  it('creates a watch and finds it by guild and app id', () => {
    const repository = createSteamWatchRepository(db);
    const id = newWatch();

    expect(id).not.toBeNull();
    const found = repository.findByGuildAndApp(GUILD, 1245620);
    expect(found?.id).toBe(id);
    expect(found?.status).toBe('pending');
    expect(found?.gameName).toBe('ELDEN RING');
  });

  it('does not create a duplicate for the same guild+app, returning null', () => {
    const repository = createSteamWatchRepository(db);
    newWatch();
    const second = repository.create({
      guildId: GUILD,
      channelId: 'channel-1',
      messageId: 'message-2',
      appId: 1245620,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 2000,
    });

    expect(second).toBeNull();
    expect(repository.listByGuild(GUILD)).toHaveLength(1);
  });

  it('allows the same app id to be tracked independently per guild', () => {
    const repository = createSteamWatchRepository(db);
    newWatch({ guildId: GUILD });
    newWatch({ guildId: OTHER_GUILD });

    expect(repository.findByGuildAndApp(GUILD, 1245620)).toBeDefined();
    expect(repository.findByGuildAndApp(OTHER_GUILD, 1245620)).toBeDefined();
  });

  it('finds rows that are due, ordered soonest first, honoring the limit', () => {
    const repository = createSteamWatchRepository(db);
    newWatch({ appId: 1, nextCheckAt: 3000 });
    newWatch({ appId: 2, nextCheckAt: 1000 });
    newWatch({ appId: 3, nextCheckAt: 2000 });
    newWatch({ appId: 4, nextCheckAt: 5000 }); // not due

    const due = repository.findDue(4000, 2);
    expect(due.map((w) => w.appId)).toEqual([2, 3]);
  });

  it('reschedules a row, updating status/date/text/next check', () => {
    const repository = createSteamWatchRepository(db);
    const id = newWatch();
    if (id === null) throw new Error('setup failed');

    repository.reschedule(id, {
      status: 'scheduled',
      releaseDate: 99999,
      releaseDateText: '14 Aug, 2026',
      nextCheckAt: 100000,
    });

    const updated = repository.findById(id);
    expect(updated?.status).toBe('scheduled');
    expect(updated?.releaseDate).toBe(99999);
    expect(updated?.releaseDateText).toBe('14 Aug, 2026');
    expect(updated?.nextCheckAt).toBe(100000);
  });

  it('reschedule optionally refreshes the game name', () => {
    const repository = createSteamWatchRepository(db);
    const id = newWatch({ gameName: 'Old Name' });
    if (id === null) throw new Error('setup failed');

    repository.reschedule(id, {
      status: 'pending',
      gameName: 'New Name',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 5000,
    });

    expect(repository.findById(id)?.gameName).toBe('New Name');
  });

  it('reschedule without a game name leaves the existing name unchanged', () => {
    const repository = createSteamWatchRepository(db);
    const id = newWatch({ gameName: 'Keep Me' });
    if (id === null) throw new Error('setup failed');

    repository.reschedule(id, {
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 5000,
    });

    expect(repository.findById(id)?.gameName).toBe('Keep Me');
  });

  it('removes a watch', () => {
    const repository = createSteamWatchRepository(db);
    const id = newWatch();
    if (id === null) throw new Error('setup failed');

    repository.remove(id);
    expect(repository.findById(id)).toBeUndefined();
  });

  it('removeForGuild deletes only when the guild matches, and reports success', () => {
    const repository = createSteamWatchRepository(db);
    const id = newWatch({ guildId: GUILD });
    if (id === null) throw new Error('setup failed');

    expect(repository.removeForGuild(OTHER_GUILD, id)).toBe(false);
    expect(repository.findById(id)).toBeDefined();

    expect(repository.removeForGuild(GUILD, id)).toBe(true);
    expect(repository.findById(id)).toBeUndefined();
  });

  it('lists watches for a guild ordered newest first', () => {
    const repository = createSteamWatchRepository(db);
    const first = newWatch({ appId: 1 });
    const second = newWatch({ appId: 2 });
    if (first === null || second === null) throw new Error('setup failed');

    const listed = repository.listByGuild(GUILD);
    expect(listed.map((w) => w.id)).toEqual([second, first]);
  });

  it('does not list watches from another guild', () => {
    const repository = createSteamWatchRepository(db);
    newWatch({ guildId: OTHER_GUILD });

    expect(repository.listByGuild(GUILD)).toEqual([]);
  });

  it('lists every watch across guilds, soonest check first', () => {
    const repository = createSteamWatchRepository(db);
    newWatch({ guildId: GUILD, appId: 1, nextCheckAt: 3000 });
    newWatch({ guildId: OTHER_GUILD, appId: 2, nextCheckAt: 1000 });

    expect(repository.listAll().map((w) => w.appId)).toEqual([2, 1]);
  });
});
