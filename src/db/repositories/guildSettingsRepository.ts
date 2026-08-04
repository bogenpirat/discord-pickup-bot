import type { DatabaseSync } from 'node:sqlite';
import {
  type ChoiceEmojis,
  NO_CHOICE_EMOJIS,
  type PickupChoice,
} from '../../domain/pickupChoice.ts';
import { DEFAULT_TIME_ZONE } from '../../domain/time/timezone.ts';
import { asNullableText, asText, type SqlRow } from '../rows.ts';

export interface GuildSettings {
  readonly guildId: string;
  readonly pickupChannelId: string | null;
  readonly mentionRoleId: string | null;
  readonly configRoleId: string | null;
  readonly emojis: ChoiceEmojis;
  readonly timezone: string;
  readonly steamWatchChannelId: string | null;
}

const EMOJI_COLUMNS: Readonly<Record<PickupChoice, string>> = {
  in: 'emoji_in',
  later: 'emoji_later',
  out: 'emoji_out',
};

export interface GuildSettingsRepository {
  get(guildId: string): GuildSettings;
  setPickupChannel(guildId: string, channelId: string | null): void;
  setMentionRole(guildId: string, roleId: string | null): void;
  setConfigRole(guildId: string, roleId: string | null): void;
  setChoiceEmoji(guildId: string, choice: PickupChoice, emoji: string | null): void;
  setTimezone(guildId: string, timezone: string): void;
  setSteamWatchChannel(guildId: string, channelId: string | null): void;
}

const defaults = (guildId: string): GuildSettings => ({
  guildId,
  pickupChannelId: null,
  mentionRoleId: null,
  configRoleId: null,
  emojis: NO_CHOICE_EMOJIS,
  timezone: DEFAULT_TIME_ZONE,
  steamWatchChannelId: null,
});

const toSettings = (row: SqlRow): GuildSettings => ({
  guildId: asText(row['guild_id']),
  pickupChannelId: asNullableText(row['pickup_channel_id']),
  mentionRoleId: asNullableText(row['mention_role_id']),
  configRoleId: asNullableText(row['config_role_id']),
  emojis: {
    in: asNullableText(row[EMOJI_COLUMNS.in]),
    later: asNullableText(row[EMOJI_COLUMNS.later]),
    out: asNullableText(row[EMOJI_COLUMNS.out]),
  },
  timezone: asText(row['timezone']),
  steamWatchChannelId: asNullableText(row['steam_watch_channel_id']),
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
  const setConfigRole = upsert('config_role_id');
  const setTimezoneValue = upsert('timezone');
  const setSteamWatchChannelValue = upsert('steam_watch_channel_id');
  const setEmoji: Readonly<Record<PickupChoice, (guildId: string, emoji: string | null) => void>> =
    {
      in: upsert(EMOJI_COLUMNS.in),
      later: upsert(EMOJI_COLUMNS.later),
      out: upsert(EMOJI_COLUMNS.out),
    };

  return {
    get: (guildId) => {
      const row = selectStatement.get(guildId);
      return row === undefined ? defaults(guildId) : toSettings(row as SqlRow);
    },
    setPickupChannel,
    setMentionRole,
    setConfigRole,
    setChoiceEmoji: (guildId, choice, emoji) => {
      setEmoji[choice](guildId, emoji);
    },
    setTimezone: (guildId, timezone) => {
      setTimezoneValue(guildId, timezone);
    },
    setSteamWatchChannel: (guildId, channelId) => {
      setSteamWatchChannelValue(guildId, channelId);
    },
  };
};
