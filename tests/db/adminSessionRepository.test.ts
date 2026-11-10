import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrations.ts';
import {
  type AdminSessionRepository,
  createAdminSessionRepository,
} from '../../src/db/repositories/adminSessionRepository.ts';

let repository: AdminSessionRepository;

const session = (tokenHash: string, expiresAt: number) => ({
  tokenHash,
  csrfToken: `csrf-${tokenHash}`,
  createdAt: 0,
  expiresAt,
});

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  repository = createAdminSessionRepository(db);
});

describe('adminSessionRepository', () => {
  it('finds a session until it expires', () => {
    repository.create(session('a', 1000));

    expect(repository.find('a', 999)).toEqual(session('a', 1000));
    expect(repository.find('a', 1000)).toBeUndefined();
  });

  it('knows nothing of a hash it never stored', () => {
    expect(repository.find('nope', 0)).toBeUndefined();
  });

  it('removes one session and leaves the rest', () => {
    repository.create(session('a', 1000));
    repository.create(session('b', 1000));

    repository.remove('a');

    expect(repository.find('a', 0)).toBeUndefined();
    expect(repository.find('b', 0)).toBeDefined();
  });

  it('prunes expired sessions only', () => {
    repository.create(session('old', 100));
    repository.create(session('fresh', 1000));

    expect(repository.pruneExpired(500)).toBe(1);
    expect(repository.find('fresh', 500)).toBeDefined();
    expect(repository.pruneExpired(500)).toBe(0);
  });
});
