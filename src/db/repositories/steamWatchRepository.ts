import type { DatabaseSync } from 'node:sqlite';
import { asNullableNumber, asNullableText, asNumber, asText, type SqlRow } from '../rows.ts';

export type SteamWatchStatus = 'pending' | 'scheduled';

export interface SteamWatchRecord {
  readonly id: number;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly appId: number;
  readonly gameName: string;
  readonly status: SteamWatchStatus;
  readonly releaseDate: number | null;
  readonly releaseDateText: string | null;
  readonly nextCheckAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateSteamWatchInput {
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly appId: number;
  readonly gameName: string;
  readonly status: SteamWatchStatus;
  readonly releaseDate: number | null;
  readonly releaseDateText: string | null;
  readonly nextCheckAt: number;
}

export interface RescheduleInput {
  readonly status: SteamWatchStatus;
  readonly gameName?: string;
  readonly releaseDate: number | null;
  readonly releaseDateText: string | null;
  readonly nextCheckAt: number;
}

export interface SteamWatchRepository {
  create(input: CreateSteamWatchInput): number | null;
  findByGuildAndApp(guildId: string, appId: number): SteamWatchRecord | undefined;
  findById(id: number): SteamWatchRecord | undefined;
  findDue(now: number, limit: number): SteamWatchRecord[];
  reschedule(id: number, patch: RescheduleInput): void;
  remove(id: number): void;
  removeForGuild(guildId: string, id: number): boolean;
  listByGuild(guildId: string): SteamWatchRecord[];
}

const toWatch = (row: SqlRow): SteamWatchRecord => ({
  id: asNumber(row['id']),
  guildId: asText(row['guild_id']),
  channelId: asText(row['channel_id']),
  messageId: asText(row['message_id']),
  appId: asNumber(row['app_id']),
  gameName: asText(row['game_name']),
  status: asText(row['status']) === 'scheduled' ? 'scheduled' : 'pending',
  releaseDate: asNullableNumber(row['release_date']),
  releaseDateText: asNullableText(row['release_date_text']),
  nextCheckAt: asNumber(row['next_check_at']),
  createdAt: asNumber(row['created_at']),
  updatedAt: asNumber(row['updated_at']),
});

export const createSteamWatchRepository = (db: DatabaseSync): SteamWatchRepository => {
  const insertStatement = db.prepare(
    `INSERT INTO steam_watches
       (guild_id, channel_id, message_id, app_id, game_name, status, release_date, release_date_text, next_check_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, app_id) DO NOTHING`,
  );
  const byGuildAndAppStatement = db.prepare(
    'SELECT * FROM steam_watches WHERE guild_id = ? AND app_id = ?',
  );
  const byIdStatement = db.prepare('SELECT * FROM steam_watches WHERE id = ?');
  const dueStatement = db.prepare(
    'SELECT * FROM steam_watches WHERE next_check_at <= ? ORDER BY next_check_at ASC LIMIT ?',
  );
  const rescheduleStatement = db.prepare(
    `UPDATE steam_watches
     SET status = ?, game_name = COALESCE(?, game_name), release_date = ?, release_date_text = ?, next_check_at = ?, updated_at = ?
     WHERE id = ?`,
  );
  const deleteStatement = db.prepare('DELETE FROM steam_watches WHERE id = ?');
  const deleteForGuildStatement = db.prepare(
    'DELETE FROM steam_watches WHERE id = ? AND guild_id = ?',
  );
  const byGuildStatement = db.prepare(
    'SELECT * FROM steam_watches WHERE guild_id = ? ORDER BY created_at DESC, id DESC',
  );

  return {
    create: (input) => {
      const now = Date.now();
      const result = insertStatement.run(
        input.guildId,
        input.channelId,
        input.messageId,
        input.appId,
        input.gameName,
        input.status,
        input.releaseDate,
        input.releaseDateText,
        input.nextCheckAt,
        now,
        now,
      );
      return result.changes > 0 ? Number(result.lastInsertRowid) : null;
    },
    findByGuildAndApp: (guildId, appId) => {
      const row = byGuildAndAppStatement.get(guildId, appId);
      return row === undefined ? undefined : toWatch(row as SqlRow);
    },
    findById: (id) => {
      const row = byIdStatement.get(id);
      return row === undefined ? undefined : toWatch(row as SqlRow);
    },
    findDue: (now, limit) => (dueStatement.all(now, limit) as SqlRow[]).map(toWatch),
    reschedule: (id, patch) => {
      rescheduleStatement.run(
        patch.status,
        patch.gameName ?? null,
        patch.releaseDate,
        patch.releaseDateText,
        patch.nextCheckAt,
        Date.now(),
        id,
      );
    },
    remove: (id) => {
      deleteStatement.run(id);
    },
    removeForGuild: (guildId, id) => deleteForGuildStatement.run(id, guildId).changes > 0,
    listByGuild: (guildId) => (byGuildStatement.all(guildId) as SqlRow[]).map(toWatch),
  };
};
