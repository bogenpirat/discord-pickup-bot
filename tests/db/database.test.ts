import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database.ts';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { asNullableNumber, asNullableText, asNumber, asText } from '../../src/db/rows.ts';

const directories: string[] = [];

const tempFile = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'pickup-db-'));
  directories.push(directory);
  return join(directory, 'pickup.db');
};

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('openDatabase', () => {
  it('creates a migrated database with foreign keys enforced', () => {
    const db = openDatabase(tempFile());

    expect(Number(db.prepare('PRAGMA user_version').get()?.['user_version'])).toBeGreaterThan(0);
    expect(Number(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'])).toBe(1);
    expect(() =>
      db
        .prepare(
          'INSERT INTO pickup_responses (pickup_id, user_id, choice, responded_at) VALUES (?, ?, ?, ?)',
        )
        .run(999, 'u1', 'in', 0),
    ).toThrow();

    db.close();
  });

  it('reopens an existing database without reapplying migrations', () => {
    const location = tempFile();
    const first = openDatabase(location);
    first
      .prepare('INSERT INTO guild_settings (guild_id, timezone, updated_at) VALUES (?, ?, ?)')
      .run('g1', 'UTC', 0);
    first.close();

    const second = openDatabase(location);
    expect(second.prepare('SELECT COUNT(*) AS c FROM guild_settings').get()?.['c']).toBe(1);
    second.close();
  });
});

describe('migrate', () => {
  it('upgrades an existing database rather than starting over', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATIONS[0] ?? '');
    db.exec('PRAGMA user_version = 1');
    db.prepare('INSERT INTO guild_settings (guild_id, timezone, updated_at) VALUES (?, ?, ?)').run(
      'g1',
      'Europe/Berlin',
      0,
    );

    migrate(db);

    expect(Number(db.prepare('PRAGMA user_version').all()[0]?.['user_version'])).toBe(
      MIGRATIONS.length,
    );
    const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get('g1');
    expect(row?.['config_role_id']).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS c FROM guild_settings').get()?.['c']).toBe(1);

    db.close();
  });

  it('rolls back and rethrows when a migration cannot apply', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE guild_settings (guild_id TEXT)');

    expect(() => {
      migrate(db);
    }).toThrow();
    expect(Number(db.prepare('PRAGMA user_version').get()?.['user_version'])).toBe(0);

    db.close();
  });
});

describe('row coercion', () => {
  it('coerces text values', () => {
    expect(asText('a')).toBe('a');
    expect(asText(5)).toBe('5');
    expect(asNullableText(null)).toBeNull();
    expect(asNullableText(undefined)).toBeNull();
    expect(asNullableText('a')).toBe('a');
  });

  it('coerces numeric values', () => {
    expect(asNumber(5)).toBe(5);
    expect(asNumber(5n)).toBe(5);
    expect(asNullableNumber(null)).toBeNull();
    expect(asNullableNumber(undefined)).toBeNull();
    expect(asNullableNumber(7n)).toBe(7);
  });
});
