import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrations.ts';
import {
  createRiotAccountRepository,
  type RiotAccountRepository,
} from '../../src/db/repositories/riotAccountRepository.ts';

const account = (overrides: Partial<Parameters<RiotAccountRepository['link']>[0]> = {}) => ({
  discordUserId: 'user-1',
  puuid: 'puuid-1',
  riotName: 'Bogenpirat',
  riotTag: 'EUW',
  region: 'eu',
  ...overrides,
});

describe('createRiotAccountRepository', () => {
  let db: DatabaseSync;
  let repository: RiotAccountRepository;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    migrate(db);
    repository = createRiotAccountRepository(db);
  });

  it('returns undefined for an unknown user', () => {
    expect(repository.find('nobody')).toBeUndefined();
    expect(repository.findByPuuid('nothing')).toBeUndefined();
  });

  it('stores and reads back a link', () => {
    repository.link(account(), 1_000);

    expect(repository.find('user-1')).toEqual({
      discordUserId: 'user-1',
      puuid: 'puuid-1',
      riotName: 'Bogenpirat',
      riotTag: 'EUW',
      region: 'eu',
      linkedAt: 1_000,
      refreshedAt: 1_000,
    });
  });

  it('finds a link by puuid', () => {
    repository.link(account(), 1_000);

    expect(repository.findByPuuid('puuid-1')?.discordUserId).toBe('user-1');
  });

  it('replaces a link for the same user and keeps the original link date', () => {
    repository.link(account(), 1_000);
    repository.link(account({ puuid: 'puuid-2', riotName: 'Other', region: 'na' }), 2_000);

    const stored = repository.find('user-1');
    expect(stored).toMatchObject({
      puuid: 'puuid-2',
      riotName: 'Other',
      region: 'na',
      linkedAt: 1_000,
      refreshedAt: 2_000,
    });
    expect(repository.findByPuuid('puuid-1')).toBeUndefined();
  });

  it('refuses to give one riot account to two discord users', () => {
    repository.link(account(), 1_000);

    expect(() => {
      repository.link(account({ discordUserId: 'user-2' }), 2_000);
    }).toThrow();
  });

  it('writes back a renamed riot id', () => {
    repository.link(account(), 1_000);
    repository.refreshIdentity('puuid-1', 'NewName', 'DE1', 'eu', 3_000);

    expect(repository.find('user-1')).toMatchObject({
      riotName: 'NewName',
      riotTag: 'DE1',
      linkedAt: 1_000,
      refreshedAt: 3_000,
    });
  });

  it('ignores a refresh for a puuid nobody linked', () => {
    repository.refreshIdentity('unknown', 'Name', 'EUW', 'eu', 3_000);

    expect(repository.listAll()).toHaveLength(0);
  });

  it('reports whether an unlink removed anything', () => {
    repository.link(account(), 1_000);

    expect(repository.unlink('user-1')).toBe(true);
    expect(repository.unlink('user-1')).toBe(false);
    expect(repository.find('user-1')).toBeUndefined();
  });

  it('lists every account oldest first', () => {
    repository.link(account({ discordUserId: 'user-2', puuid: 'puuid-2' }), 2_000);
    repository.link(account(), 1_000);

    expect(repository.listAll().map((entry) => entry.discordUserId)).toEqual(['user-1', 'user-2']);
  });
});
