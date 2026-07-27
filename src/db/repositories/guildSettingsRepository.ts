import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TIME_ZONE } from '../../domain/time/timezone.ts';
import { asNullableText, asText, type SqlRow } from '../rows.ts';

export interface GuildSettings {
  readonly guildId: string;
  readonly pickupChannelId: string | null;
  readonly mentionRoleId: string | null;
  readonly timezone: string;
}

export interface GuildSettingsRepository {
  get(guildId: string): GuildSettings;
  setPickupChannel(guildId: string, channelId: string | null): void;
  setMentionRole(guildId: string, roleId: string | null): void;
  setTimezone(guildId: string, timezone: string): void;
}

const defaults = (guildId: string): GuildSettings => ({
  guildId,
  pickupChannelId: null,
  mentionRoleId: null,
  timezone: DEFAULT_TIME_ZONE,
});

const toSettings = (row: SqlRow): GuildSettings => ({
  guildId: asText(row['guild_id']),
  pickupChannelId: asNullableText(row['pickup_channel_id']),
  mentionRoleId: asNullableText(row['mention_role_id']),
  timezone: asText(row['timezone']),
});

export const createGuildSettingsRepository = (db: DatabaseSync): GuildSettingsRepository => {
  const selectStatement = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');

  const upsert = (column: string): ((guildId: string, value: string | null) => void) => {
    const statement = db.prepare(
      `INSERT INTO guild_settings (guild_id, ${column}, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (guild_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
    );
    return (guildId, value) => {
      statement.run(guildId, value, Date.now());
    };
  };

  const setPickupChannel = upsert('pickup_channel_id');
  const setMentionRole = upsert('mention_role_id');
  const setTimezoneValue = upsert('timezone');

  return {
    get: (guildId) => {
      const row = selectStatement.get(guildId);
      return row === undefined ? defaults(guildId) : toSettings(row as SqlRow);
    },
    setPickupChannel,
    setMentionRole,
    setTimezone: (guildId, timezone) => {
      setTimezoneValue(guildId, timezone);
    },
  };
};
