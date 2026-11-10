import type { GuildSettings } from '../../db/repositories/guildSettingsRepository.ts';
import type { DirectoryGuildDetail } from '../../discord/guildDirectory.ts';
import { parseEmoji } from '../../domain/emoji.ts';
import type { ChoiceEmojis } from '../../domain/pickupChoice.ts';
import { isValidTimeZone } from '../../domain/time/timezone.ts';

export type FormProblem = 'unknownChannel' | 'unknownRole' | 'invalidEmoji' | 'invalidTimezone';

/** Every setting the console edits, under the name its form field carries. */
export const CHANNEL_FIELDS = {
  pickup_channel: 'pickupChannelId',
  cinema_channel: 'cinemaChannelId',
  steam_channel: 'steamWatchChannelId',
} as const;

export const ROLE_FIELDS = {
  mention_role: 'mentionRoleId',
  cinema_role: 'cinemaRoleId',
  config_role: 'configRoleId',
} as const;

export const EMOJI_FIELDS = { emoji_in: 'in', emoji_later: 'later', emoji_out: 'out' } as const;

export type ChannelField = keyof typeof CHANNEL_FIELDS;
export type RoleField = keyof typeof ROLE_FIELDS;
export type EmojiField = keyof typeof EMOJI_FIELDS;
export type FormField = ChannelField | RoleField | EmojiField | 'timezone';

/** What the form showed or was sent: raw text per field, blank meaning none. */
export type SettingsDraft = Readonly<Record<FormField, string>>;

/** The settings a valid submission writes. */
export interface EditableSettings {
  readonly pickupChannelId: string | null;
  readonly cinemaChannelId: string | null;
  readonly steamWatchChannelId: string | null;
  readonly mentionRoleId: string | null;
  readonly cinemaRoleId: string | null;
  readonly configRoleId: string | null;
  readonly emojis: ChoiceEmojis;
  readonly timezone: string;
}

export type FormProblems = ReadonlyMap<FormField, FormProblem>;

export type ParsedSettingsForm =
  | { readonly ok: true; readonly settings: EditableSettings }
  | { readonly ok: false; readonly draft: SettingsDraft; readonly problems: FormProblems };

const entries = <T extends object>(record: T) =>
  Object.entries(record) as [keyof T & string, T[keyof T]][];

/** The draft a form starts from: whatever is stored right now. */
export const draftFromSettings = (settings: GuildSettings): SettingsDraft => {
  const draft: Record<string, string> = { timezone: settings.timezone };
  for (const [field, key] of entries(CHANNEL_FIELDS)) {
    draft[field] = settings[key] ?? '';
  }
  for (const [field, key] of entries(ROLE_FIELDS)) {
    draft[field] = settings[key] ?? '';
  }
  for (const [field, choice] of entries(EMOJI_FIELDS)) {
    draft[field] = settings.emojis[choice] ?? '';
  }
  return draft as SettingsDraft;
};

/**
 * Validates a submitted settings form against what the server actually has.
 *
 * A channel or role must exist in the guild — or be the value already stored,
 * so a channel Discord has since deleted does not make the whole form
 * unsavable, nor get cleared just because some other field was edited.
 */
export const parseSettingsForm = (
  form: URLSearchParams,
  guild: DirectoryGuildDetail,
  current: GuildSettings,
): ParsedSettingsForm => {
  const read = (field: FormField): string => (form.get(field) ?? '').trim();
  const draft: Record<string, string> = {};
  const problems = new Map<FormField, FormProblem>();

  const channelIds = new Set(guild.channels.map((channel) => channel.id));
  const roleIds = new Set(guild.roles.map((role) => role.id));

  const pickId = (
    field: ChannelField | RoleField,
    known: ReadonlySet<string>,
    stored: string | null,
    problem: FormProblem,
  ): string | null => {
    const value = read(field);
    draft[field] = value;
    if (value === '') {
      return null;
    }
    if (!known.has(value) && value !== stored) {
      problems.set(field, problem);
    }
    return value;
  };

  const channels = Object.fromEntries(
    entries(CHANNEL_FIELDS).map(([field, key]) => [
      key,
      pickId(field, channelIds, current[key], 'unknownChannel'),
    ]),
  ) as Record<(typeof CHANNEL_FIELDS)[ChannelField], string | null>;

  const roles = Object.fromEntries(
    entries(ROLE_FIELDS).map(([field, key]) => [
      key,
      pickId(field, roleIds, current[key], 'unknownRole'),
    ]),
  ) as Record<(typeof ROLE_FIELDS)[RoleField], string | null>;

  const emojis = Object.fromEntries(
    entries(EMOJI_FIELDS).map(([field, choice]) => {
      const value = read(field);
      draft[field] = value;
      if (value === '') {
        return [choice, null];
      }
      const parsed = parseEmoji(value);
      if (!parsed.ok) {
        problems.set(field, 'invalidEmoji');
        return [choice, null];
      }
      return [choice, parsed.value];
    }),
  ) as Record<keyof ChoiceEmojis, string | null>;

  const timezone = read('timezone');
  draft['timezone'] = timezone;
  if (!isValidTimeZone(timezone)) {
    problems.set('timezone', 'invalidTimezone');
  }

  if (problems.size > 0) {
    return { ok: false, draft: draft as SettingsDraft, problems };
  }

  return { ok: true, settings: { ...channels, ...roles, emojis, timezone } };
};
