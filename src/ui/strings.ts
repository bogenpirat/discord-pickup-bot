import type { PickupChoice } from '../domain/pickupChoice.ts';

export const APP_LOCALES = ['de', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'de';

export const resolveLocale = (discordLocale: string | null | undefined): AppLocale =>
  discordLocale?.startsWith('en') === true ? 'en' : DEFAULT_LOCALE;

export interface Strings {
  readonly choice: Readonly<Record<PickupChoice, string>>;
  readonly closeButton: string;
  readonly title: string;
  readonly noneYet: string;
  readonly moreNames: (count: number) => string;
  readonly startsAt: string;
  readonly organizer: string;
  readonly closedFooter: string;
  readonly openFooter: string;
  readonly noChannelConfigured: string;
  readonly channelUnavailable: string;
  readonly pickupNotFound: string;
  readonly pickupAlreadyClosed: string;
  readonly notAllowedToClose: string;
  readonly missingPermission: string;
  readonly adminOnly: string;
  readonly guildOnly: string;
  readonly invalidTimezone: (value: string) => string;
  readonly configChannelSaved: (channelId: string) => string;
  readonly configRoleSaved: (roleId: string) => string;
  readonly configRoleCleared: string;
  readonly configAdminRoleSaved: (roleId: string) => string;
  readonly configAdminRoleCleared: string;
  readonly configTimezoneSaved: (timezone: string) => string;
  readonly configEmojiSaved: (label: string, emoji: string) => string;
  readonly configEmojiReset: (label: string, emoji: string) => string;
  readonly invalidEmoji: (value: string) => string;
  readonly configSummary: (parts: ConfigSummaryParts) => string;
  readonly notSet: string;
  readonly posted: (url: string) => string;
  readonly timeNotUnderstood: string;
  readonly noTimeFound: string;
  readonly noPickupToEdit: string;
  readonly notAllowedToEditTime: string;
  readonly timeUpdated: (url: string) => string;
  readonly unexpectedError: string;
  readonly steamWatchChannelSaved: (channelId: string) => string;
  readonly steamWatchListEmpty: string;
  readonly steamWatchListEntry: (parts: SteamWatchListEntryParts) => string;
  readonly steamWatchPendingText: string;
  readonly steamWatchRemoved: (name: string) => string;
  readonly steamWatchNotFound: string;
  readonly steamReleasedContent: (name: string) => string;
  readonly steamPriceLabel: string;
}

export interface SteamWatchListEntryParts {
  readonly id: number;
  readonly name: string;
  readonly status: string;
}

export interface ConfigSummaryParts {
  readonly channel: string;
  readonly role: string;
  readonly adminRole: string;
  readonly emojis: string;
  readonly timezone: string;
}

const de: Strings = {
  choice: { in: 'Dabei', later: 'Später', out: 'Raus' },
  closeButton: 'Schließen',
  title: 'Pickup',
  noneYet: '—',
  moreNames: (count) => `… +${count} weitere`,
  startsAt: 'Start',
  organizer: 'Aufgerufen von',
  closedFooter: 'Geschlossen',
  openFooter: 'Klick einen Button, um zu antworten',
  noChannelConfigured:
    'Es ist noch kein Pickup-Kanal gesetzt. Ein Admin kann ihn mit `/pickup-config channel` festlegen.',
  channelUnavailable:
    'Ich kann im konfigurierten Kanal nicht schreiben. Bitte prüfe meine Berechtigungen.',
  pickupNotFound: 'Dieser Pickup existiert nicht mehr.',
  pickupAlreadyClosed: 'Dieser Pickup ist bereits geschlossen.',
  notAllowedToClose: 'Nur der Ersteller oder ein Admin kann diesen Pickup schließen.',
  missingPermission:
    'Dafür brauchst du die Berechtigung „Server verwalten“ oder die konfigurierte Admin-Rolle.',
  adminOnly:
    'Nur Mitglieder mit „Server verwalten“ (oder ein Power-User) können die Admin-Rolle ändern.',
  guildOnly: 'Dieser Befehl funktioniert nur auf einem Server.',
  invalidTimezone: (value) => `„${value}“ ist keine gültige Zeitzone. Beispiel: \`Europe/Berlin\`.`,
  configChannelSaved: (channelId) => `Pickup-Kanal ist jetzt <#${channelId}>.`,
  configRoleSaved: (roleId) => `Erwähnte Rolle ist jetzt <@&${roleId}>.`,
  configRoleCleared: 'Es wird jetzt keine Rolle mehr erwähnt.',
  configAdminRoleSaved: (roleId) => `<@&${roleId}> darf jetzt die Config-Befehle nutzen.`,
  configAdminRoleCleared: 'Es ist keine Admin-Rolle mehr gesetzt.',
  configTimezoneSaved: (timezone) => `Zeitzone ist jetzt \`${timezone}\`.`,
  configEmojiSaved: (label, emoji) => `${emoji} wird jetzt für „${label}“ angezeigt.`,
  configEmojiReset: (label, emoji) => `„${label}“ nutzt wieder das Standard-Emoji ${emoji}.`,
  invalidEmoji: (value) =>
    `„${value}“ sieht nicht nach einem Emoji aus. Nutze ein Unicode-Emoji oder ein Server-Emoji wie \`<:name:123456789012345678>\`.`,
  configSummary: (parts) =>
    `**Kanal:** ${parts.channel}\n**Rolle:** ${parts.role}\n**Admin-Rolle:** ${parts.adminRole}\n**Emojis:** ${parts.emojis}\n**Zeitzone:** \`${parts.timezone}\``,
  notSet: 'nicht gesetzt',
  posted: (url) => `Pickup gepostet: ${url}`,
  timeNotUnderstood:
    'Die Zeit habe ich nicht verstanden und zeige sie unverändert an. Verstanden werden z. B. `20:30`, `20 Uhr`, `halb 9`, `viertel vor 9`, `in 90 Minuten`, `morgen 20:30`, `Sonntag 20 Uhr`.',
  noTimeFound:
    'Ich habe keine Uhrzeit gefunden und zeige deinen Text als Notiz. Erkannt werden z. B. `20:30`, `20 Uhr`, `halb 9`, `viertel vor 9`, `in 90 Minuten`, `morgen 20:30`, `Sonntag 20 Uhr`. Mit `/valo-time` kannst du die Zeit nachtragen.',
  noPickupToEdit: 'Hier wurde noch kein Pickup gepostet, den ich ändern könnte.',
  notAllowedToEditTime:
    'Nur der Ersteller, ein Admin oder die konfigurierte Admin-Rolle kann die Zeit ändern.',
  timeUpdated: (url) => `Zeit geändert: ${url}`,
  unexpectedError: 'Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.',
  steamWatchChannelSaved: (channelId) => `Steam-Release-Kanal ist jetzt <#${channelId}>.`,
  steamWatchListEmpty: 'Gerade wird kein Spiel beobachtet.',
  steamWatchListEntry: (parts) => `**${parts.name}** (#${parts.id}) — ${parts.status}`,
  steamWatchPendingText: 'noch kein Datum bekannt',
  steamWatchRemoved: (name) => `**${name}** wird nicht mehr beobachtet.`,
  steamWatchNotFound: 'Dazu habe ich keinen beobachteten Eintrag gefunden.',
  steamReleasedContent: (name) => `🎮 **${name}** ist jetzt verfügbar!`,
  steamPriceLabel: 'Preis',
};

const en: Strings = {
  choice: { in: 'In', later: 'Later', out: 'Out' },
  closeButton: 'Close',
  title: 'Pickup',
  noneYet: '—',
  moreNames: (count) => `… +${count} more`,
  startsAt: 'Starts',
  organizer: 'Called by',
  closedFooter: 'Closed',
  openFooter: 'Click a button to respond',
  noChannelConfigured:
    'No pickup channel is configured yet. An admin can set one with `/pickup-config channel`.',
  channelUnavailable: 'I cannot post in the configured channel. Please check my permissions.',
  pickupNotFound: 'This pickup no longer exists.',
  pickupAlreadyClosed: 'This pickup is already closed.',
  notAllowedToClose: 'Only the creator or an admin can close this pickup.',
  missingPermission: 'You need the Manage Server permission or the configured admin role for that.',
  adminOnly: 'Only members with Manage Server (or a power user) can change the admin role.',
  guildOnly: 'This command only works inside a server.',
  invalidTimezone: (value) => `"${value}" is not a valid time zone. Example: \`Europe/Berlin\`.`,
  configChannelSaved: (channelId) => `Pickup channel is now <#${channelId}>.`,
  configRoleSaved: (roleId) => `Mentioned role is now <@&${roleId}>.`,
  configRoleCleared: 'No role will be mentioned any more.',
  configAdminRoleSaved: (roleId) => `<@&${roleId}> may now use the config commands.`,
  configAdminRoleCleared: 'No admin role is set any more.',
  configTimezoneSaved: (timezone) => `Time zone is now \`${timezone}\`.`,
  configEmojiSaved: (label, emoji) => `${emoji} is now shown for "${label}".`,
  configEmojiReset: (label, emoji) => `"${label}" is back to its default emoji ${emoji}.`,
  invalidEmoji: (value) =>
    `"${value}" does not look like an emoji. Use a unicode emoji or a server emoji such as \`<:name:123456789012345678>\`.`,
  configSummary: (parts) =>
    `**Channel:** ${parts.channel}\n**Role:** ${parts.role}\n**Admin role:** ${parts.adminRole}\n**Emojis:** ${parts.emojis}\n**Time zone:** \`${parts.timezone}\``,
  notSet: 'not set',
  posted: (url) => `Pickup posted: ${url}`,
  timeNotUnderstood:
    'I could not read that time and will show it as written. Understood formats include `20:30`, `8pm`, `half past 8`, `in 90 minutes`, `tomorrow 8pm`, `sunday 8pm`.',
  noTimeFound:
    'I did not find a time in there and will show your text as a note. Recognised formats include `20:30`, `8pm`, `half past 8`, `in 90 minutes`, `tomorrow 8pm`, `sunday 8pm`. Use `/valo-time` to add one afterwards.',
  noPickupToEdit: 'No pickup has been posted here yet that I could change.',
  notAllowedToEditTime:
    'Only the creator, an admin or the configured admin role can change the time.',
  timeUpdated: (url) => `Time changed: ${url}`,
  unexpectedError: 'Something went wrong. Please try again.',
  steamWatchChannelSaved: (channelId) => `Steam release channel is now <#${channelId}>.`,
  steamWatchListEmpty: 'No games are currently being watched.',
  steamWatchListEntry: (parts) => `**${parts.name}** (#${parts.id}) — ${parts.status}`,
  steamWatchPendingText: 'no date yet',
  steamWatchRemoved: (name) => `**${name}** is no longer being watched.`,
  steamWatchNotFound: 'Could not find a watched entry for that.',
  steamReleasedContent: (name) => `🎮 **${name}** is now available!`,
  steamPriceLabel: 'Price',
};

export const STRINGS: Readonly<Record<AppLocale, Strings>> = { de, en };

export const stringsFor = (locale: AppLocale): Strings => STRINGS[locale];
