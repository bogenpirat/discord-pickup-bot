import type { PickupChoice } from '../domain/pickupChoice.ts';

export const APP_LOCALES = ['de', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'de';

export const resolveLocale = (discordLocale: string | null | undefined): AppLocale =>
  discordLocale?.startsWith('en') === true ? 'en' : DEFAULT_LOCALE;

export interface Strings {
  readonly choice: Readonly<Record<PickupChoice, string>>;
  readonly choiceField: Readonly<Record<PickupChoice, string>>;
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
  readonly guildOnly: string;
  readonly invalidTimezone: (value: string) => string;
  readonly configChannelSaved: (channelId: string) => string;
  readonly configRoleSaved: (roleId: string) => string;
  readonly configRoleCleared: string;
  readonly configTimezoneSaved: (timezone: string) => string;
  readonly configSummary: (channel: string, role: string, timezone: string) => string;
  readonly notSet: string;
  readonly posted: (url: string) => string;
  readonly timeNotUnderstood: string;
  readonly unexpectedError: string;
}

const de: Strings = {
  choice: { in: 'Dabei', ifMore: 'Wenn mehr', out: 'Raus' },
  choiceField: { in: '✅ Dabei', ifMore: '🤔 Wenn mehr', out: '❌ Raus' },
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
  missingPermission: 'Dafür brauchst du die Berechtigung „Server verwalten“.',
  guildOnly: 'Dieser Befehl funktioniert nur auf einem Server.',
  invalidTimezone: (value) => `„${value}“ ist keine gültige Zeitzone. Beispiel: \`Europe/Berlin\`.`,
  configChannelSaved: (channelId) => `Pickup-Kanal ist jetzt <#${channelId}>.`,
  configRoleSaved: (roleId) => `Erwähnte Rolle ist jetzt <@&${roleId}>.`,
  configRoleCleared: 'Es wird jetzt keine Rolle mehr erwähnt.',
  configTimezoneSaved: (timezone) => `Zeitzone ist jetzt \`${timezone}\`.`,
  configSummary: (channel, role, timezone) =>
    `**Kanal:** ${channel}\n**Rolle:** ${role}\n**Zeitzone:** \`${timezone}\``,
  notSet: 'nicht gesetzt',
  posted: (url) => `Pickup gepostet: ${url}`,
  timeNotUnderstood:
    'Die Zeit habe ich nicht verstanden und zeige sie unverändert an. Verstanden werden z. B. `20:30`, `20 Uhr`, `halb 9`, `viertel vor 9`, `in 90 Minuten`, `morgen 20:30`.',
  unexpectedError: 'Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.',
};

const en: Strings = {
  choice: { in: 'In', ifMore: 'If more', out: 'Out' },
  choiceField: { in: '✅ In', ifMore: '🤔 If more', out: '❌ Out' },
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
  missingPermission: 'You need the Manage Server permission for that.',
  guildOnly: 'This command only works inside a server.',
  invalidTimezone: (value) => `"${value}" is not a valid time zone. Example: \`Europe/Berlin\`.`,
  configChannelSaved: (channelId) => `Pickup channel is now <#${channelId}>.`,
  configRoleSaved: (roleId) => `Mentioned role is now <@&${roleId}>.`,
  configRoleCleared: 'No role will be mentioned any more.',
  configTimezoneSaved: (timezone) => `Time zone is now \`${timezone}\`.`,
  configSummary: (channel, role, timezone) =>
    `**Channel:** ${channel}\n**Role:** ${role}\n**Time zone:** \`${timezone}\``,
  notSet: 'not set',
  posted: (url) => `Pickup posted: ${url}`,
  timeNotUnderstood:
    'I could not read that time and will show it as written. Understood formats include `20:30`, `8pm`, `half past 8`, `in 90 minutes`, `tomorrow 8pm`.',
  unexpectedError: 'Something went wrong. Please try again.',
};

export const STRINGS: Readonly<Record<AppLocale, Strings>> = { de, en };

export const stringsFor = (locale: AppLocale): Strings => STRINGS[locale];
