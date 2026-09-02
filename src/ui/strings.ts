import type { PickupChoice } from '../domain/pickupChoice.ts';
import type { MatchOutcome } from '../domain/valorant/matchSummary.ts';
import type { RiotIdProblem } from '../domain/valorant/riotId.ts';

export const APP_LOCALES = ['de', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'de';

export const resolveLocale = (discordLocale: string | null | undefined): AppLocale =>
  discordLocale?.startsWith('en') === true ? 'en' : DEFAULT_LOCALE;

export interface Strings {
  readonly choice: Readonly<Record<PickupChoice, string>>;
  readonly closeButton: string;
  readonly calendarTitle: (guildName: string | null) => string;
  readonly calendarDetails: (messageUrl: string) => string;
  readonly calendarGoogleButton: string;
  readonly calendarIcalButton: string;
  readonly title: string;
  readonly noneYet: string;
  readonly moreNames: (count: number) => string;
  readonly startsAt: string;
  readonly organizer: string;
  readonly closedFooter: string;
  readonly openFooter: string;
  readonly noFallbackChannel: string;
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
  readonly postedElsewhere: (channelId: string, url: string) => string;
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
  readonly valorantNotConfigured: string;
  readonly valorantUnauthorized: string;
  readonly valorantRateLimited: string;
  readonly valorantApiUnavailable: string;
  readonly riotIdProblem: Readonly<Record<RiotIdProblem, string>>;
  readonly invalidRiotId: (value: string, reason: string) => string;
  readonly riotAccountNotFound: (riotId: string) => string;
  readonly riotAccountLinked: (parts: RiotAccountParts) => string;
  readonly riotAccountTaken: (riotId: string, userId: string) => string;
  readonly riotAccountShown: (userId: string, parts: RiotAccountParts) => string;
  readonly riotAccountNotLinked: string;
  readonly riotAccountNotLinkedOther: (userId: string) => string;
  readonly riotAccountRefreshed: (parts: RiotAccountParts) => string;
  readonly riotAccountUnchanged: (parts: RiotAccountParts) => string;
  readonly riotAccountUnlinked: string;
  readonly valorantApiStatus: (parts: ValorantApiStatusParts) => string;
  readonly valorantProbeOk: (version: string) => string;
  readonly valorantProbeFailed: (reason: string) => string;
  readonly valorantNotBlocked: string;
  readonly valorantBlockedUntil: (timestamp: string) => string;
  readonly never: string;
  readonly eloRankLabel: string;
  readonly eloRankValue: (tier: string, rr: number) => string;
  readonly eloLastChangeLabel: string;
  readonly eloPeakLabel: string;
  readonly eloPeakValue: (tier: string, season: string) => string;
  readonly eloLeaderboardLabel: string;
  readonly eloRecord: (parts: EloRecordParts) => string;
  readonly eloNoHistory: string;
  readonly eloNoRankedData: (riotId: string) => string;
  readonly valorantRiotIdAdminOnly: string;
  readonly matchTitle: (map: string, outcome: string) => string;
  readonly matchOutcome: Readonly<Record<MatchOutcome, string>>;
  readonly matchHeadline: (parts: MatchHeadlineParts) => string;
  readonly matchYouLabel: (agent: string) => string;
  readonly matchYouValue: (parts: MatchStatParts) => string;
  readonly matchTeamLabel: (averageTier: string | null) => string;
  readonly matchEnemyLabel: (averageTier: string | null) => string;
  readonly matchNone: (riotId: string) => string;
}

export interface MatchHeadlineParts {
  readonly score: string;
  readonly mode: string;
  /** A rendered Discord timestamp, so this layer stays free of time logic. */
  readonly when: string;
  readonly duration: string;
}

export interface MatchStatParts {
  readonly kda: string;
  readonly acs: number;
  readonly adr: number;
  readonly headshots: string;
}

export interface EloRecordParts {
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  /** Already signed, e.g. `+164`. */
  readonly net: string;
}

export interface RiotAccountParts {
  readonly riotId: string;
  readonly region: string;
  readonly puuid: string;
  /** Preformatted Discord timestamp, so this layer stays free of time logic. */
  readonly linkedAt: string;
}

export interface ValorantApiStatusParts {
  readonly probe: string;
  readonly used: number;
  readonly limit: number;
  readonly waiting: number;
  readonly requests: number;
  readonly failures: number;
  readonly rateLimitHits: number;
  readonly lastRateLimited: string;
  readonly blocked: string;
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
  calendarTitle: (guildName) =>
    guildName === null ? 'Gaming-Session' : `Gaming-Session @ ${guildName}`,
  calendarDetails: (messageUrl) => `Organisiert über Discord: ${messageUrl}`,
  calendarGoogleButton: 'GCal',
  calendarIcalButton: 'iCal',
  title: 'Pickup',
  noneYet: '—',
  moreNames: (count) => `… +${count} weitere`,
  startsAt: 'Start',
  organizer: 'Aufgerufen von',
  closedFooter: 'Geschlossen',
  openFooter: 'Klick einen Button, um zu antworten',
  noFallbackChannel:
    'Ich kann hier nicht schreiben und es ist kein Ausweich-Kanal gesetzt. Ein Admin kann ihn mit `/pickup-config kanal` festlegen.',
  channelUnavailable: 'Ich kann in diesem Kanal nicht schreiben. Bitte prüfe meine Berechtigungen.',
  pickupNotFound: 'Dieser Pickup existiert nicht mehr.',
  pickupAlreadyClosed: 'Dieser Pickup ist bereits geschlossen.',
  notAllowedToClose: 'Nur der Ersteller oder ein Admin kann diesen Pickup schließen.',
  missingPermission:
    'Dafür brauchst du die Berechtigung „Server verwalten“ oder die konfigurierte Admin-Rolle.',
  adminOnly:
    'Nur Mitglieder mit „Server verwalten“ (oder ein Power-User) können die Admin-Rolle ändern.',
  guildOnly: 'Dieser Befehl funktioniert nur auf einem Server.',
  invalidTimezone: (value) => `„${value}“ ist keine gültige Zeitzone. Beispiel: \`Europe/Berlin\`.`,
  configChannelSaved: (channelId) => `Ausweich-Kanal ist jetzt <#${channelId}>.`,
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
    `**Ausweich-Kanal:** ${parts.channel}\n**Rolle:** ${parts.role}\n**Admin-Rolle:** ${parts.adminRole}\n**Emojis:** ${parts.emojis}\n**Zeitzone:** \`${parts.timezone}\``,
  notSet: 'nicht gesetzt',
  posted: (url) => `Pickup gepostet: ${url}`,
  postedElsewhere: (channelId, url) =>
    `Ich kann hier nicht schreiben — der Pickup ist in <#${channelId}> gelandet: ${url}`,
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
  valorantNotConfigured:
    'Für diesen Bot ist kein Valorant-API-Schlüssel hinterlegt. Ein Admin muss `VALORANT_API_KEY` setzen.',
  valorantUnauthorized:
    'Die Valorant-API hat den Schlüssel abgelehnt. Ein Admin sollte `VALORANT_API_KEY` prüfen.',
  valorantRateLimited:
    'Das Limit der Valorant-API ist gerade erschöpft. Bitte versuch es in einer Minute noch einmal.',
  valorantApiUnavailable:
    'Die Valorant-API antwortet gerade nicht. Bitte versuch es später noch einmal.',
  riotIdProblem: {
    'missing-tag': 'es fehlt das `#` mit dem Tag',
    'empty-name': 'vor dem `#` steht kein Name',
    'name-too-long': 'der Name ist länger als 16 Zeichen',
    'invalid-tag': 'der Tag muss aus 3 bis 5 Buchstaben oder Ziffern bestehen',
  },
  invalidRiotId: (value, reason) =>
    `„${value}“ ist keine gültige Riot-ID: ${reason}. Beispiel: \`Name#EUW\`.`,
  riotAccountNotFound: (riotId) =>
    `Riot kennt **${riotId}** nicht. Achte auf Groß-/Kleinschreibung und den richtigen Tag.`,
  riotAccountLinked: (parts) =>
    `Verknüpft mit **${parts.riotId}** (Region \`${parts.region}\`).\nPUUID: \`${parts.puuid}\``,
  riotAccountTaken: (riotId, userId) => `**${riotId}** ist bereits mit <@${userId}> verknüpft.`,
  riotAccountShown: (userId, parts) =>
    `<@${userId}> → **${parts.riotId}** (Region \`${parts.region}\`)\nVerknüpft seit ${parts.linkedAt}\nPUUID: \`${parts.puuid}\``,
  riotAccountNotLinked: 'Du hast noch keine Riot-ID hinterlegt. Nutze `/valo-account verknüpfen`.',
  riotAccountNotLinkedOther: (userId) => `<@${userId}> hat noch keine Riot-ID hinterlegt.`,
  riotAccountRefreshed: (parts) =>
    `Aktualisiert: du heißt jetzt **${parts.riotId}** (Region \`${parts.region}\`).`,
  riotAccountUnchanged: (parts) =>
    `Alles aktuell: **${parts.riotId}** (Region \`${parts.region}\`).`,
  riotAccountUnlinked: 'Deine Riot-ID ist nicht mehr hinterlegt.',
  valorantApiStatus: (parts) =>
    [
      `**Valorant-API:** ${parts.probe}`,
      `**Limit:** ${parts.used}/${parts.limit} in der letzten Minute, ${parts.waiting} wartend`,
      `**Gesperrt:** ${parts.blocked}`,
      `**Gesamt:** ${parts.requests} Anfragen, ${parts.failures} Fehler, ${parts.rateLimitHits}× 429`,
      `**Letztes 429:** ${parts.lastRateLimited}`,
    ].join('\n'),
  valorantProbeOk: (version) => `✅ erreichbar (Spielversion \`${version}\`)`,
  valorantProbeFailed: (reason) => `⚠️ ${reason}`,
  valorantNotBlocked: 'nein',
  valorantBlockedUntil: (timestamp) => `ja, bis ${timestamp}`,
  never: 'nie',
  eloRankLabel: 'Rang',
  eloRankValue: (tier, rr) => `${tier} · ${rr} RR`,
  eloLastChangeLabel: 'Letztes Match',
  eloPeakLabel: 'Bestwert',
  eloPeakValue: (tier, season) => `${tier} (${season})`,
  eloLeaderboardLabel: 'Leaderboard',
  eloRecord: (parts) =>
    `${parts.matches} Matches · ${parts.wins}S ${parts.losses}N · ${parts.net} Elo`,
  eloNoHistory: 'keine gewerteten Matches gefunden',
  eloNoRankedData: (riotId) =>
    `Für **${riotId}** liegen keine Ranglisten-Daten vor. Vielleicht wurde die Platzierung noch nicht gespielt.`,
  valorantRiotIdAdminOnly:
    'Eine fremde Riot-ID darf nur abfragen, wer die Config-Befehle nutzen darf. Ohne Angabe nutzt der Befehl deine eigene verknüpfte Riot-ID.',
  matchTitle: (map, outcome) => `${map} · ${outcome}`,
  matchOutcome: { win: 'Sieg', loss: 'Niederlage', draw: 'Unentschieden' },
  matchHeadline: (parts) =>
    `**${parts.score}** · ${parts.mode} · ${parts.when} · ${parts.duration}`,
  matchYouLabel: (agent) => `Deine Leistung (${agent})`,
  matchYouValue: (parts) =>
    `**${parts.kda}** K/D/A · ${parts.acs} ACS · ${parts.adr} ADR · ${parts.headshots} Kopftreffer`,
  matchTeamLabel: (averageTier) =>
    averageTier === null ? 'Dein Team' : `Dein Team · Ø ${averageTier}`,
  matchEnemyLabel: (averageTier) => (averageTier === null ? 'Gegner' : `Gegner · Ø ${averageTier}`),
  matchNone: (riotId) => `Für **${riotId}** habe ich kein letztes Match gefunden.`,
};

const en: Strings = {
  choice: { in: 'In', later: 'Later', out: 'Out' },
  closeButton: 'Close',
  calendarTitle: (guildName) =>
    guildName === null ? 'Gaming session' : `Gaming session @ ${guildName}`,
  calendarDetails: (messageUrl) => `Organised via Discord: ${messageUrl}`,
  calendarGoogleButton: 'GCal',
  calendarIcalButton: 'iCal',
  title: 'Pickup',
  noneYet: '—',
  moreNames: (count) => `… +${count} more`,
  startsAt: 'Starts',
  organizer: 'Called by',
  closedFooter: 'Closed',
  openFooter: 'Click a button to respond',
  noFallbackChannel:
    'I cannot post here and no fallback channel is configured. An admin can set one with `/pickup-config channel`.',
  channelUnavailable: 'I cannot post in that channel. Please check my permissions.',
  pickupNotFound: 'This pickup no longer exists.',
  pickupAlreadyClosed: 'This pickup is already closed.',
  notAllowedToClose: 'Only the creator or an admin can close this pickup.',
  missingPermission: 'You need the Manage Server permission or the configured admin role for that.',
  adminOnly: 'Only members with Manage Server (or a power user) can change the admin role.',
  guildOnly: 'This command only works inside a server.',
  invalidTimezone: (value) => `"${value}" is not a valid time zone. Example: \`Europe/Berlin\`.`,
  configChannelSaved: (channelId) => `Fallback channel is now <#${channelId}>.`,
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
    `**Fallback channel:** ${parts.channel}\n**Role:** ${parts.role}\n**Admin role:** ${parts.adminRole}\n**Emojis:** ${parts.emojis}\n**Time zone:** \`${parts.timezone}\``,
  notSet: 'not set',
  posted: (url) => `Pickup posted: ${url}`,
  postedElsewhere: (channelId, url) =>
    `I cannot post here, so the pickup went to <#${channelId}>: ${url}`,
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
  valorantNotConfigured:
    'No Valorant API key is configured for this bot. An admin needs to set `VALORANT_API_KEY`.',
  valorantUnauthorized:
    'The Valorant API rejected the key. An admin should check `VALORANT_API_KEY`.',
  valorantRateLimited: 'The Valorant API rate limit is exhausted. Please try again in a minute.',
  valorantApiUnavailable: 'The Valorant API is not responding right now. Please try again later.',
  riotIdProblem: {
    'missing-tag': 'the `#` and tag are missing',
    'empty-name': 'there is no name before the `#`',
    'name-too-long': 'the name is longer than 16 characters',
    'invalid-tag': 'the tag must be 3 to 5 letters or digits',
  },
  invalidRiotId: (value, reason) =>
    `"${value}" is not a valid Riot ID: ${reason}. Example: \`Name#EUW\`.`,
  riotAccountNotFound: (riotId) => `Riot does not know **${riotId}**. Check the spelling and tag.`,
  riotAccountLinked: (parts) =>
    `Linked to **${parts.riotId}** (region \`${parts.region}\`).\nPUUID: \`${parts.puuid}\``,
  riotAccountTaken: (riotId, userId) => `**${riotId}** is already linked by <@${userId}>.`,
  riotAccountShown: (userId, parts) =>
    `<@${userId}> → **${parts.riotId}** (region \`${parts.region}\`)\nLinked since ${parts.linkedAt}\nPUUID: \`${parts.puuid}\``,
  riotAccountNotLinked: 'You have not linked a Riot ID yet. Use `/valo-account link`.',
  riotAccountNotLinkedOther: (userId) => `<@${userId}> has not linked a Riot ID yet.`,
  riotAccountRefreshed: (parts) =>
    `Updated: you are now **${parts.riotId}** (region \`${parts.region}\`).`,
  riotAccountUnchanged: (parts) =>
    `Already up to date: **${parts.riotId}** (region \`${parts.region}\`).`,
  riotAccountUnlinked: 'Your Riot ID is no longer stored.',
  valorantApiStatus: (parts) =>
    [
      `**Valorant API:** ${parts.probe}`,
      `**Limit:** ${parts.used}/${parts.limit} in the last minute, ${parts.waiting} waiting`,
      `**Blocked:** ${parts.blocked}`,
      `**Totals:** ${parts.requests} requests, ${parts.failures} failures, ${parts.rateLimitHits}× 429`,
      `**Last 429:** ${parts.lastRateLimited}`,
    ].join('\n'),
  valorantProbeOk: (version) => `✅ reachable (game version \`${version}\`)`,
  valorantProbeFailed: (reason) => `⚠️ ${reason}`,
  valorantNotBlocked: 'no',
  valorantBlockedUntil: (timestamp) => `yes, until ${timestamp}`,
  never: 'never',
  eloRankLabel: 'Rank',
  eloRankValue: (tier, rr) => `${tier} · ${rr} RR`,
  eloLastChangeLabel: 'Last match',
  eloPeakLabel: 'Peak',
  eloPeakValue: (tier, season) => `${tier} (${season})`,
  eloLeaderboardLabel: 'Leaderboard',
  eloRecord: (parts) =>
    `${parts.matches} matches · ${parts.wins}W ${parts.losses}L · ${parts.net} elo`,
  eloNoHistory: 'no ranked matches found',
  eloNoRankedData: (riotId) =>
    `No ranked data for **${riotId}**. They may not have played placements yet.`,
  valorantRiotIdAdminOnly:
    'Only members who may use the config commands can look up someone else. Without the option this command uses your own linked Riot ID.',
  matchTitle: (map, outcome) => `${map} · ${outcome}`,
  matchOutcome: { win: 'Win', loss: 'Loss', draw: 'Draw' },
  matchHeadline: (parts) =>
    `**${parts.score}** · ${parts.mode} · ${parts.when} · ${parts.duration}`,
  matchYouLabel: (agent) => `Your game (${agent})`,
  matchYouValue: (parts) =>
    `**${parts.kda}** K/D/A · ${parts.acs} ACS · ${parts.adr} ADR · ${parts.headshots} headshots`,
  matchTeamLabel: (averageTier) =>
    averageTier === null ? 'Your team' : `Your team · avg ${averageTier}`,
  matchEnemyLabel: (averageTier) =>
    averageTier === null ? 'Enemy team' : `Enemy team · avg ${averageTier}`,
  matchNone: (riotId) => `I could not find a recent match for **${riotId}**.`,
};

export const STRINGS: Readonly<Record<AppLocale, Strings>> = { de, en };

export const stringsFor = (locale: AppLocale): Strings => STRINGS[locale];
