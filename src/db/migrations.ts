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
  `
  ALTER TABLE guild_settings ADD COLUMN config_role_id TEXT;
  `,
  `
  ALTER TABLE guild_settings ADD COLUMN emoji_in TEXT;
  ALTER TABLE guild_settings ADD COLUMN emoji_later TEXT;
  ALTER TABLE guild_settings ADD COLUMN emoji_out TEXT;
  `,
  `
  ALTER TABLE guild_settings ADD COLUMN steam_watch_channel_id TEXT;

  CREATE TABLE steam_watches (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id          TEXT NOT NULL,
    channel_id        TEXT NOT NULL,
    message_id        TEXT NOT NULL,
    app_id            INTEGER NOT NULL,
    game_name         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending',
    release_date      INTEGER,
    release_date_text TEXT,
    next_check_at     INTEGER NOT NULL,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX idx_steam_watches_guild_app ON steam_watches (guild_id, app_id);
  CREATE INDEX idx_steam_watches_next_check ON steam_watches (next_check_at);
  `,
  `
  -- Keyed by the Discord user rather than by (guild, user): a person's Riot
  -- account is the same in every server, and the puuid is what survives a Riot
  -- ID change, so it is the column everything downstream will join on.
  CREATE TABLE riot_accounts (
    discord_user_id TEXT PRIMARY KEY,
    puuid           TEXT NOT NULL UNIQUE,
    riot_name       TEXT NOT NULL,
    riot_tag        TEXT NOT NULL,
    region          TEXT NOT NULL,
    linked_at       INTEGER NOT NULL,
    refreshed_at    INTEGER NOT NULL
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
