import type { AppLocale } from '../../ui/strings.ts';
import type { FormProblem } from './settingsForm.ts';

export interface ConsoleStrings {
  readonly brand: string;
  readonly loginHeading: string;
  readonly loginIntro: string;
  readonly username: string;
  readonly password: string;
  readonly loginButton: string;
  readonly loginFailed: string;
  readonly loginThrottled: string;
  readonly logout: string;
  readonly serversHeading: string;
  readonly serversIntro: string;
  readonly serversEmpty: string;
  readonly allServers: string;
  readonly saved: string;
  readonly watchRemoved: string;
  readonly fixProblems: string;
  readonly save: string;
  readonly noChannel: string;
  readonly noRole: string;
  readonly missingOption: (id: string) => string;
  readonly announcement: string;
  readonly gameHeading: string;
  readonly gameIntro: string;
  readonly cinemaHeading: string;
  readonly cinemaIntro: string;
  readonly role: string;
  readonly roleHint: string;
  readonly fallbackChannel: string;
  readonly fallbackChannelHint: string;
  readonly iconsHeading: string;
  readonly iconsIntro: string;
  readonly generalHeading: string;
  readonly timezone: string;
  readonly timezoneHint: string;
  readonly adminRole: string;
  readonly adminRoleHint: string;
  readonly steamHeading: string;
  readonly steamChannel: string;
  readonly steamChannelHint: string;
  readonly watchesHeading: string;
  readonly watchesEmpty: string;
  readonly watchPending: string;
  readonly remove: string;
  readonly problem: Readonly<Record<FormProblem, string>>;
  readonly notFound: string;
  readonly crossSite: string;
}

const de: ConsoleStrings = {
  brand: 'Pickup-Bot',
  loginHeading: 'Anmelden',
  loginIntro: 'Melde dich an, um die Einstellungen des Bots zu bearbeiten.',
  username: 'Benutzername',
  password: 'Passwort',
  loginButton: 'Anmelden',
  loginFailed: 'Benutzername oder Passwort stimmt nicht.',
  loginThrottled: 'Zu viele Fehlversuche. Versuch es in ein paar Minuten noch einmal.',
  logout: 'Abmelden',
  serversHeading: 'Server',
  serversIntro: 'Wähle einen Server, um seine Einstellungen zu bearbeiten.',
  serversEmpty: 'Der Bot ist gerade auf keinem Server.',
  allServers: 'Alle Server',
  saved: 'Gespeichert.',
  watchRemoved: 'Das Spiel wird nicht mehr beobachtet.',
  fixProblems: 'Nichts gespeichert. Bitte korrigiere die markierten Felder.',
  save: 'Speichern',
  noChannel: '— kein Kanal —',
  noRole: '— keine Rolle —',
  missingOption: (id) => `nicht mehr vorhanden (${id})`,
  announcement: 'Ankündigungen',
  gameHeading: 'Valorant-Pickup',
  gameIntro: 'Die Runde, die mit /valo ausgerufen wird.',
  cinemaHeading: 'Filmabend',
  cinemaIntro: 'Der Filmabend, der mit /pickup ausgerufen wird.',
  role: 'Erwähnte Rolle',
  roleHint: 'Wird beim Ausrufen gepingt.',
  fallbackChannel: 'Ausweich-Kanal',
  fallbackChannelHint: 'Nur genutzt, wenn der Bot im aufrufenden Kanal nicht schreiben darf.',
  iconsHeading: 'Icons',
  iconsIntro:
    'Für die drei Antworten bei /valo. Unicode-Emoji oder ein Server-Emoji wie <:name:123456789012345678>, leer lassen für das Standard-Icon. Der Filmabend hat feste Icons.',
  generalHeading: 'Allgemein',
  timezone: 'Zeitzone',
  timezoneHint: 'IANA-Zeitzone, in der Startzeiten gelesen werden, z. B. Europe/Berlin.',
  adminRole: 'Admin-Rolle',
  adminRoleHint:
    'Darf zusätzlich zu „Server verwalten“ die Config-Befehle nutzen und fremde Pickup-Zeiten ändern.',
  steamHeading: 'Steam-Releases',
  steamChannel: 'Beobachteter Kanal',
  steamChannelHint:
    'Steam-Links zu unveröffentlichten Spielen in diesem Kanal werden bis zum Release verfolgt.',
  watchesHeading: 'Beobachtete Spiele',
  watchesEmpty: 'Gerade wird kein Spiel beobachtet.',
  watchPending: 'noch kein Datum bekannt',
  remove: 'Entfernen',
  problem: {
    unknownChannel: 'Diesen Kanal gibt es auf dem Server nicht.',
    unknownRole: 'Diese Rolle gibt es auf dem Server nicht.',
    invalidEmoji: 'Das sieht nicht nach einem Emoji aus.',
    invalidTimezone: 'Unbekannte Zeitzone. Beispiel: Europe/Berlin.',
  },
  notFound: 'Diese Seite gibt es nicht.',
  crossSite: 'Die Anfrage kam nicht von dieser Seite. Lade sie neu und versuch es noch einmal.',
};

const en: ConsoleStrings = {
  brand: 'Pickup bot',
  loginHeading: 'Sign in',
  loginIntro: "Sign in to edit the bot's settings.",
  username: 'Username',
  password: 'Password',
  loginButton: 'Sign in',
  loginFailed: 'Wrong username or password.',
  loginThrottled: 'Too many failed attempts. Try again in a few minutes.',
  logout: 'Sign out',
  serversHeading: 'Servers',
  serversIntro: 'Pick a server to edit its settings.',
  serversEmpty: 'The bot is not in any server right now.',
  allServers: 'All servers',
  saved: 'Saved.',
  watchRemoved: 'The game is no longer being watched.',
  fixProblems: 'Nothing was saved. Please fix the marked fields.',
  save: 'Save',
  noChannel: '— no channel —',
  noRole: '— no role —',
  missingOption: (id) => `no longer exists (${id})`,
  announcement: 'announcements',
  gameHeading: 'Valorant pickup',
  gameIntro: 'The game called with /valo.',
  cinemaHeading: 'Movie night',
  cinemaIntro: 'The movie night called with /pickup.',
  role: 'Mentioned role',
  roleHint: 'Pinged when the call goes out.',
  fallbackChannel: 'Fallback channel',
  fallbackChannelHint: 'Only used when the bot cannot post in the channel the command was used in.',
  iconsHeading: 'Icons',
  iconsIntro:
    'For the three responses on /valo. A unicode emoji or a server emoji such as <:name:123456789012345678>, empty for the default. Movie nights have fixed icons.',
  generalHeading: 'General',
  timezone: 'Time zone',
  timezoneHint: 'IANA time zone start times are read in, e.g. Europe/Berlin.',
  adminRole: 'Admin role',
  adminRoleHint:
    "May use the config commands alongside Manage Server, and change other people's pickup times.",
  steamHeading: 'Steam releases',
  steamChannel: 'Watched channel',
  steamChannelHint: 'Steam links to unreleased games posted here are followed until release.',
  watchesHeading: 'Watched games',
  watchesEmpty: 'No games are being watched right now.',
  watchPending: 'no date yet',
  remove: 'Remove',
  problem: {
    unknownChannel: 'That channel does not exist on this server.',
    unknownRole: 'That role does not exist on this server.',
    invalidEmoji: 'That does not look like an emoji.',
    invalidTimezone: 'Unknown time zone. Example: Europe/Berlin.',
  },
  notFound: 'There is no such page.',
  crossSite: 'That request did not come from this page. Reload it and try again.',
};

const CONSOLE_STRINGS: Readonly<Record<AppLocale, ConsoleStrings>> = { de, en };

export const consoleStringsFor = (locale: AppLocale): ConsoleStrings => CONSOLE_STRINGS[locale];
