import type { DatabaseSync } from 'node:sqlite';
import { asNullableNumber, asNullableText, asNumber, asText, type SqlRow } from '../rows.ts';

export type PickupStatus = 'open' | 'closed';

export interface PickupRecord {
  readonly id: number;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string | null;
  readonly creatorId: string;
  readonly startsAt: number | null;
  readonly startsAtText: string | null;
  readonly note: string | null;
  readonly status: PickupStatus;
  readonly createdAt: number;
  readonly closedAt: number | null;
}

export interface CreatePickupInput {
  readonly guildId: string;
  readonly channelId: string;
  readonly creatorId: string;
  readonly startsAt: number | null;
  readonly startsAtText: string | null;
  readonly note: string | null;
}

export interface PickupRepository {
  create(input: CreatePickupInput): number;
  attachMessage(id: number, messageId: string): void;
  findById(id: number): PickupRecord | undefined;
  findByMessageId(messageId: string): PickupRecord | undefined;
  close(id: number, closedAt: number): void;
  remove(id: number): void;
}

const toPickup = (row: SqlRow): PickupRecord => ({
  id: asNumber(row['id']),
  guildId: asText(row['guild_id']),
  channelId: asText(row['channel_id']),
  messageId: asNullableText(row['message_id']),
  creatorId: asText(row['creator_id']),
  startsAt: asNullableNumber(row['starts_at']),
  startsAtText: asNullableText(row['starts_at_text']),
  note: asNullableText(row['note']),
  status: asText(row['status']) === 'closed' ? 'closed' : 'open',
  createdAt: asNumber(row['created_at']),
  closedAt: asNullableNumber(row['closed_at']),
});

export const createPickupRepository = (db: DatabaseSync): PickupRepository => {
  const insertStatement = db.prepare(
    `INSERT INTO pickups (guild_id, channel_id, creator_id, starts_at, starts_at_text, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
  );
  const attachStatement = db.prepare('UPDATE pickups SET message_id = ? WHERE id = ?');
  const byIdStatement = db.prepare('SELECT * FROM pickups WHERE id = ?');
  const byMessageStatement = db.prepare('SELECT * FROM pickups WHERE message_id = ?');
  const closeStatement = db.prepare(
    "UPDATE pickups SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'",
  );
  const deleteStatement = db.prepare('DELETE FROM pickups WHERE id = ?');

  return {
    create: (input) => {
      const result = insertStatement.run(
        input.guildId,
        input.channelId,
        input.creatorId,
        input.startsAt,
        input.startsAtText,
        input.note,
        Date.now(),
      );
      return Number(result.lastInsertRowid);
    },
    attachMessage: (id, messageId) => {
      attachStatement.run(messageId, id);
    },
    findById: (id) => {
      const row = byIdStatement.get(id);
      return row === undefined ? undefined : toPickup(row as SqlRow);
    },
    findByMessageId: (messageId) => {
      const row = byMessageStatement.get(messageId);
      return row === undefined ? undefined : toPickup(row as SqlRow);
    },
    close: (id, closedAt) => {
      closeStatement.run(closedAt, id);
    },
    remove: (id) => {
      deleteStatement.run(id);
    },
  };
};
