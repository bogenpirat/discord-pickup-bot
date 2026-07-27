import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE guild_settings (
    guild_id          TEXT PRIMARY KEY,
    pickup_channel_id TEXT,
    mention_role_id   TEXT,
    timezone          TEXT NOT NULL DEFAULT 'Europe/Berlin',
    updated_at        INTEGER NOT NULL
  );

  CREATE TABLE pickups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id       TEXT NOT NULL,
    channel_id     TEXT NOT NULL,
    message_id     TEXT UNIQUE,
    creator_id     TEXT NOT NULL,
    starts_at      INTEGER,
    starts_at_text TEXT,
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'open',
    created_at     INTEGER NOT NULL,
    closed_at      INTEGER
  );

  CREATE INDEX idx_pickups_guild_status ON pickups (guild_id, status);

  CREATE TABLE pickup_responses (
    pickup_id    INTEGER NOT NULL REFERENCES pickups (id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    choice       TEXT NOT NULL,
    responded_at INTEGER NOT NULL,
    PRIMARY KEY (pickup_id, user_id)
  );
  `,
];

const readUserVersion = (db: DatabaseSync): number =>
  Number(db.prepare('PRAGMA user_version').all()[0]?.['user_version']);

export const migrate = (db: DatabaseSync): void => {
  const applied = readUserVersion(db);

  for (const [index, statement] of MIGRATIONS.entries()) {
    if (index < applied) {
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(statement);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};
