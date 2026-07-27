import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/database.ts';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { createGuildSettingsRepository } from '../../src/db/repositories/guildSettingsRepository.ts';
import { createPickupRepository } from '../../src/db/repositories/pickupRepository.ts';
import { createResponseRepository } from '../../src/db/repositories/responseRepository.ts';

const GUILD = 'guild-1';

let db: DatabaseSync;

const freshDatabase = (): DatabaseSync => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migrate(database);
  return database;
};

beforeEach(() => {
  db = freshDatabase();
});

const newPickup = (overrides: Partial<{ startsAt: number | null; note: string | null }> = {}) =>
  createPickupRepository(db).create({
    guildId: GUILD,
    channelId: 'channel-1',
    creatorId: 'creator-1',
    startsAt: overrides.startsAt ?? null,
    startsAtText: null,
    note: overrides.note ?? null,
  });

describe('migrations', () => {
  it('applies from scratch and records the version', () => {
    const row = db.prepare('PRAGMA user_version').get();
    expect(Number(row?.['user_version'])).toBe(MIGRATIONS.length);
  });

  it('is idempotent when run again', () => {
    expect(() => {
      migrate(db);
    }).not.toThrow();
    expect(Number(db.prepare('PRAGMA user_version').get()?.['user_version'])).toBe(
      MIGRATIONS.length,
    );
  });
});

describe('guildSettingsRepository', () => {
  it('returns defaults for an unknown guild without writing a row', () => {
    const repository = createGuildSettingsRepository(db);
    const settings = repository.get('unknown');

    expect(settings).toEqual({
      guildId: 'unknown',
      pickupChannelId: null,
      mentionRoleId: null,
      configRoleId: null,
      emojis: { in: null, later: null, out: null },
      timezone: 'Europe/Berlin',
    });
    expect(db.prepare('SELECT COUNT(*) AS c FROM guild_settings').get()?.['c']).toBe(0);
  });

  it('persists each field independently', () => {
    const repository = createGuildSettingsRepository(db);

    repository.setPickupChannel(GUILD, 'channel-1');
    repository.setMentionRole(GUILD, 'role-1');
    repository.setConfigRole(GUILD, 'role-admin');
    repository.setChoiceEmoji(GUILD, 'in', '🔥');
    repository.setTimezone(GUILD, 'UTC');

    expect(repository.get(GUILD)).toEqual({
      guildId: GUILD,
      pickupChannelId: 'channel-1',
      mentionRoleId: 'role-1',
      configRoleId: 'role-admin',
      emojis: { in: '🔥', later: null, out: null },
      timezone: 'UTC',
    });
  });

  it('stores an emoji per choice independently', () => {
    const repository = createGuildSettingsRepository(db);

    repository.setChoiceEmoji(GUILD, 'in', '🔥');
    repository.setChoiceEmoji(GUILD, 'later', '<:soon:123456789012345678>');
    repository.setChoiceEmoji(GUILD, 'out', '💀');

    expect(repository.get(GUILD).emojis).toEqual({
      in: '🔥',
      later: '<:soon:123456789012345678>',
      out: '💀',
    });
  });

  it('resets a single emoji back to null', () => {
    const repository = createGuildSettingsRepository(db);

    repository.setChoiceEmoji(GUILD, 'in', '🔥');
    repository.setChoiceEmoji(GUILD, 'out', '💀');
    repository.setChoiceEmoji(GUILD, 'in', null);

    expect(repository.get(GUILD).emojis).toEqual({ in: null, later: null, out: '💀' });
  });

  it('clears the config role', () => {
    const repository = createGuildSettingsRepository(db);
    repository.setConfigRole(GUILD, 'role-admin');
    repository.setConfigRole(GUILD, null);
    expect(repository.get(GUILD).configRoleId).toBeNull();
  });

  it('updates rather than duplicating on repeat writes', () => {
    const repository = createGuildSettingsRepository(db);

    repository.setPickupChannel(GUILD, 'channel-1');
    repository.setPickupChannel(GUILD, 'channel-2');

    expect(repository.get(GUILD).pickupChannelId).toBe('channel-2');
    expect(db.prepare('SELECT COUNT(*) AS c FROM guild_settings').get()?.['c']).toBe(1);
  });

  it('clears the mention role', () => {
    const repository = createGuildSettingsRepository(db);
    repository.setMentionRole(GUILD, 'role-1');
    repository.setMentionRole(GUILD, null);
    expect(repository.get(GUILD).mentionRoleId).toBeNull();
  });
});

describe('pickupRepository', () => {
  it('creates an open pickup with no message attached', () => {
    const repository = createPickupRepository(db);
    const id = newPickup({ note: 'ranked' });
    const pickup = repository.findById(id);

    expect(pickup?.status).toBe('open');
    expect(pickup?.messageId).toBeNull();
    expect(pickup?.note).toBe('ranked');
    expect(pickup?.startsAt).toBeNull();
  });

  it('finds a pickup by its message id once attached', () => {
    const repository = createPickupRepository(db);
    const id = newPickup();

    expect(repository.findByMessageId('message-1')).toBeUndefined();
    repository.attachMessage(id, 'message-1');
    expect(repository.findByMessageId('message-1')?.id).toBe(id);
  });

  it('allows many pickups without a message id', () => {
    newPickup();
    newPickup();
    expect(db.prepare('SELECT COUNT(*) AS c FROM pickups').get()?.['c']).toBe(2);
  });

  it('round trips a start time', () => {
    const repository = createPickupRepository(db);
    const startsAt = Date.UTC(2026, 6, 27, 18, 30);
    const id = newPickup({ startsAt });
    expect(repository.findById(id)?.startsAt).toBe(startsAt);
  });

  it('closes idempotently and preserves the first close time', () => {
    const repository = createPickupRepository(db);
    const id = newPickup();

    repository.close(id, 1000);
    repository.close(id, 2000);

    const pickup = repository.findById(id);
    expect(pickup?.status).toBe('closed');
    expect(pickup?.closedAt).toBe(1000);
  });

  it('removes a pickup', () => {
    const repository = createPickupRepository(db);
    const id = newPickup();
    repository.remove(id);
    expect(repository.findById(id)).toBeUndefined();
  });
});

describe('responseRepository', () => {
  it('lists responses in the order they arrived', () => {
    const repository = createResponseRepository(db);
    const id = newPickup();

    repository.set(id, 'u2', 'in', 200);
    repository.set(id, 'u1', 'in', 100);

    expect(repository.listByPickup(id).map((response) => response.userId)).toEqual(['u1', 'u2']);
  });

  it('overwrites a users choice rather than duplicating', () => {
    const repository = createResponseRepository(db);
    const id = newPickup();

    repository.set(id, 'u1', 'in', 100);
    repository.set(id, 'u1', 'out', 200);

    const responses = repository.listByPickup(id);
    expect(responses).toHaveLength(1);
    expect(responses[0]?.choice).toBe('out');
    expect(responses[0]?.respondedAt).toBe(200);
  });

  it('removes a single users response', () => {
    const repository = createResponseRepository(db);
    const id = newPickup();

    repository.set(id, 'u1', 'in', 100);
    repository.set(id, 'u2', 'in', 110);
    repository.remove(id, 'u1');

    expect(repository.listByPickup(id).map((response) => response.userId)).toEqual(['u2']);
  });

  it('keeps responses scoped to their pickup', () => {
    const repository = createResponseRepository(db);
    const first = newPickup();
    const second = newPickup();

    repository.set(first, 'u1', 'in', 100);
    repository.set(second, 'u1', 'out', 100);

    expect(repository.listByPickup(first)[0]?.choice).toBe('in');
    expect(repository.listByPickup(second)[0]?.choice).toBe('out');
  });

  it('cascades deletes when the pickup is removed', () => {
    const pickups = createPickupRepository(db);
    const responses = createResponseRepository(db);
    const id = newPickup();

    responses.set(id, 'u1', 'in', 100);
    pickups.remove(id);

    expect(responses.listByPickup(id)).toEqual([]);
  });

  it('skips rows with an unknown choice', () => {
    const responses = createResponseRepository(db);
    const id = newPickup();

    db.prepare(
      'INSERT INTO pickup_responses (pickup_id, user_id, choice, responded_at) VALUES (?, ?, ?, ?)',
    ).run(id, 'u1', 'teleport', 100);

    expect(responses.listByPickup(id)).toEqual([]);
  });
});

describe('withTransaction', () => {
  it('commits on success', () => {
    const responses = createResponseRepository(db);
    const id = newPickup();

    withTransaction(db, () => {
      responses.set(id, 'u1', 'in', 100);
    });

    expect(responses.listByPickup(id)).toHaveLength(1);
  });

  it('rolls back on failure', () => {
    const responses = createResponseRepository(db);
    const id = newPickup();

    expect(() =>
      withTransaction(db, () => {
        responses.set(id, 'u1', 'in', 100);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(responses.listByPickup(id)).toEqual([]);
  });

  it('returns the callback result', () => {
    expect(withTransaction(db, () => 'done')).toBe('done');
  });
});
