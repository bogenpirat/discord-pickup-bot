import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  roleMention,
  TimestampStyles,
  time,
  userMention,
} from 'discord.js';
import type { PickupRecord } from '../db/repositories/pickupRepository.ts';
import { encodeClose, encodeRespond } from '../discord/customId.ts';
import { googleCalendarLink } from '../domain/calendar/googleCalendarLink.ts';
import {
  type ChoiceEmojis,
  emojiFor,
  NO_CHOICE_EMOJIS,
  PICKUP_CHOICES,
  type PickupChoice,
} from '../domain/pickupChoice.ts';
import { groupByChoice, type ResponseSet, tally } from '../domain/pickupState.ts';
import { CINEMA_CHOICE_EMOJIS } from '../domain/pickupTheme.ts';
import { pickupCalendarEvent } from './calendarEvent.ts';
import { type AppLocale, DEFAULT_LOCALE, type Strings, stringsFor } from './strings.ts';

const MAX_NAMES = 15;
const FIELD_LIMIT = 1024;
const BUTTON_URL_LIMIT = 512;
/** How many code points to give back per attempt at fitting a URL in a button. */
const SHORTEN_STEP = 10;
const ELLIPSIS = '…';

const CALENDAR_EMOJI = '📅';
const ICAL_EMOJI = '📆';

const GAME_COLOR = 0x5865f2;
/** Velvet curtain red. */
const CINEMA_COLOR = 0xb3121d;
const CLOSED_COLOR = 0x71767b;

const PRESENTER_EMOJI = '🎥';
const SHOWTIME_EMOJI = '🕗';
const REEL_EMOJI = '🎞️';

const BUTTON_STYLES: Readonly<Record<PickupChoice, ButtonStyle>> = {
  in: ButtonStyle.Success,
  later: ButtonStyle.Primary,
  out: ButtonStyle.Secondary,
};

export interface PickupView {
  readonly pickup: PickupRecord;
  readonly responses: ResponseSet;
  readonly mentionRoleId: string | null;
  /** Names the calendar event. Absent when the guild is not in cache. */
  readonly guildName?: string | null;
  /** Public origin of the bot's HTTP server. Absent when it is not configured. */
  readonly publicBaseUrl?: string | null;
  readonly emojis?: ChoiceEmojis;
  readonly locale?: AppLocale;
}

export interface PickupMessagePayload {
  readonly content: string;
  readonly embeds: EmbedBuilder[];
  readonly components: ActionRowBuilder<ButtonBuilder>[];
  readonly allowedMentions: { readonly parse: []; readonly roles: string[] };
}

export const renderNames = (responses: ResponseSet, strings: Strings): string => {
  if (responses.length === 0) {
    return strings.noneYet;
  }

  let visible = Math.min(responses.length, MAX_NAMES);

  while (visible > 0) {
    const shown = responses.slice(0, visible).map((response) => userMention(response.userId));
    const remaining = responses.length - visible;
    const text =
      remaining > 0 ? `${shown.join('\n')}\n${strings.moreNames(remaining)}` : shown.join('\n');

    if (text.length <= FIELD_LIMIT) {
      return text;
    }
    visible -= 1;
  }

  return strings.moreNames(responses.length);
};

/** How the start reads, or null when there is nothing to say about it. */
const renderStart = (pickup: PickupRecord): string | null => {
  if (pickup.startsAt !== null) {
    const startsAt = new Date(pickup.startsAt);
    return `${time(startsAt, TimestampStyles.ShortTime)} (${time(startsAt, TimestampStyles.RelativeTime)})`;
  }
  return pickup.startsAtText;
};

/**
 * The labels and icons on the three response buttons and their fields. A movie
 * night brings its own and ignores the per-server emoji settings, which were
 * chosen for the game call.
 */
interface ChoiceDisplay {
  readonly labels: Readonly<Record<PickupChoice, string>>;
  readonly emojis: ChoiceEmojis;
  readonly closeButton: string;
}

const choiceDisplay = (view: PickupView, strings: Strings): ChoiceDisplay =>
  view.pickup.theme === 'cinema'
    ? {
        labels: strings.cinema.choice,
        emojis: CINEMA_CHOICE_EMOJIS,
        closeButton: strings.cinema.closeButton,
      }
    : {
        labels: strings.choice,
        emojis: view.emojis ?? NO_CHOICE_EMOJIS,
        closeButton: strings.closeButton,
      };

const addChoiceFields = (
  embed: EmbedBuilder,
  view: PickupView,
  strings: Strings,
  display: ChoiceDisplay,
): void => {
  const groups = groupByChoice(view.responses);

  for (const choice of PICKUP_CHOICES) {
    const group = groups[choice];
    embed.addFields({
      name: `${emojiFor(choice, display.emojis)} ${display.labels[choice]} (${group.length})`,
      value: renderNames(group, strings),
      inline: true,
    });
  }
};

const buildGameEmbed = (view: PickupView, strings: Strings): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle(view.pickup.note === null ? strings.title : `${strings.title} — ${view.pickup.note}`)
    .setColor(view.pickup.status === 'closed' ? CLOSED_COLOR : GAME_COLOR)
    .setFooter({
      text: view.pickup.status === 'closed' ? strings.closedFooter : strings.openFooter,
    });

  const lines = [`${strings.organizer}: ${userMention(view.pickup.creatorId)}`];
  const start = renderStart(view.pickup);
  if (start !== null) {
    lines.push(`${strings.startsAt}: ${start}`);
  }

  embed.setDescription(lines.join('\n'));
  addChoiceFields(embed, view, strings, choiceDisplay(view, strings));

  return embed;
};

/**
 * A movie night is laid out like a poster: the marquee over the feature, who
 * presents it and when it shows, and the pickup's id doubling as the
 * screening number at the bottom of the ticket.
 */
const buildCinemaEmbed = (view: PickupView, strings: Strings): EmbedBuilder => {
  const cinema = strings.cinema;
  const closed = view.pickup.status === 'closed';
  const embed = new EmbedBuilder()
    .setAuthor({ name: cinema.marquee })
    .setTitle(`${REEL_EMOJI} ${view.pickup.note ?? cinema.untitled}`)
    .setColor(closed ? CLOSED_COLOR : CINEMA_COLOR)
    .setFooter({
      text: closed ? cinema.closedFooter(view.pickup.id) : cinema.openFooter(view.pickup.id),
    });

  const lines = [`${PRESENTER_EMOJI} ${cinema.presentedBy} ${userMention(view.pickup.creatorId)}`];
  const start = renderStart(view.pickup);
  if (start !== null) {
    lines.push(`${SHOWTIME_EMOJI} ${cinema.showtime}: ${start}`);
  }

  embed.setDescription(lines.join('\n'));
  addChoiceFields(embed, view, strings, choiceDisplay(view, strings));

  return embed;
};

const buildEmbed = (view: PickupView, strings: Strings): EmbedBuilder =>
  view.pickup.theme === 'cinema' ? buildCinemaEmbed(view, strings) : buildGameEmbed(view, strings);

/** Lengths to try, longest first, down to nothing. */
const lengthsDownFrom = (total: number): number[] => {
  const lengths: number[] = [];

  for (let length = total; length > 0; length -= SHORTEN_STEP) {
    lengths.push(length);
  }
  lengths.push(0);

  return lengths;
};

/**
 * Cuts by code point, because slicing a surrogate pair in half would break the
 * encoding. Null for nothing left, so it drops out of the event entirely. The
 * marker marks a cut as one — a shortened title reads as a name, so it gets
 * none, while a shortened note has to admit that there is more to read.
 */
const cutTo = (points: readonly string[], length: number, marker = ''): string | null => {
  if (length === 0) {
    return null;
  }

  return length >= points.length ? points.join('') : `${points.slice(0, length).join('')}${marker}`;
};

/**
 * The Google Calendar link only exists once a discrete start time is known.
 * Both the note and the guild name ride along in the event, so they are
 * shortened until the whole URL fits the limit Discord puts on a link button.
 *
 * The note gives way first: the permalink at the end of the description leads
 * straight to the full text, while a truncated guild name is lost for good.
 */
const buildGoogleUrl = (
  pickup: PickupRecord,
  guildName: string | null,
  strings: Strings,
): string | null => {
  if (pickup.startsAt === null) {
    return null;
  }

  const name = guildName === null ? [] : [...guildName];
  const note = pickup.note === null ? [] : [...pickup.note];

  const attempt = (noteLength: number, nameLength: number): string | null => {
    const event = pickupCalendarEvent(
      { ...pickup, note: cutTo(note, noteLength, ELLIPSIS) },
      cutTo(name, nameLength),
      strings,
    );

    if (event === null) {
      return null;
    }

    const url = googleCalendarLink(event);

    return url.length <= BUTTON_URL_LIMIT ? url : null;
  };

  for (const noteLength of lengthsDownFrom(note.length)) {
    const url = attempt(noteLength, name.length);

    if (url !== null) {
      return url;
    }
  }

  for (const nameLength of lengthsDownFrom(name.length)) {
    const url = attempt(0, nameLength);

    if (url !== null) {
      return url;
    }
  }

  return null;
};

/**
 * Points at this bot's own HTTP server, which renders the `.ics` per request —
 * so unlike the Google link, nothing about the event is baked into the URL and
 * a time changed later needs no re-render. Absent when no server is configured.
 */
const buildIcalUrl = (
  pickup: PickupRecord,
  publicBaseUrl: string | null,
  locale: AppLocale,
): string | null =>
  pickup.startsAt === null || publicBaseUrl === null
    ? null
    : `${publicBaseUrl}/pickup/calendar/${pickup.id}.ics?lang=${locale}`;

const buildComponents = (
  view: PickupView,
  strings: Strings,
  locale: AppLocale,
): ActionRowBuilder<ButtonBuilder>[] => {
  const counts = tally(view.responses);
  const disabled = view.pickup.status === 'closed';
  const display = choiceDisplay(view, strings);

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...PICKUP_CHOICES.map((choice) =>
      new ButtonBuilder()
        .setCustomId(encodeRespond(choice, view.pickup.id))
        .setLabel(`${display.labels[choice]} · ${counts[choice]}`)
        .setStyle(BUTTON_STYLES[choice])
        .setEmoji(emojiFor(choice, display.emojis))
        .setDisabled(disabled),
    ),
    new ButtonBuilder()
      .setCustomId(encodeClose(view.pickup.id))
      .setLabel(display.closeButton)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  // Link buttons open the calendar directly, so they stay usable even on a
  // closed pickup — the game itself is still happening. They live on their own
  // row because the four buttons above already fill Discord's limit of five.
  const googleUrl = buildGoogleUrl(view.pickup, view.guildName ?? null, strings);
  const icalUrl = buildIcalUrl(view.pickup, view.publicBaseUrl ?? null, locale);

  if (googleUrl === null && icalUrl === null) {
    return [actions];
  }

  const calendar = new ActionRowBuilder<ButtonBuilder>();

  if (googleUrl !== null) {
    calendar.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setEmoji(CALENDAR_EMOJI)
        .setLabel(strings.calendarGoogleButton)
        .setURL(googleUrl),
    );
  }

  if (icalUrl !== null) {
    calendar.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setEmoji(ICAL_EMOJI)
        .setLabel(strings.calendarIcalButton)
        .setURL(icalUrl),
    );
  }

  return [actions, calendar];
};

/**
 * The line above the embed carries the ping. A movie night adds its curtain
 * call while the box office is open; a closed pickup says nothing up there.
 */
const renderContent = (
  view: PickupView,
  strings: Strings,
  mentionRoleId: string | null,
): string => {
  const mention = mentionRoleId === null ? null : roleMention(mentionRoleId);

  if (view.pickup.theme !== 'cinema' || view.pickup.status === 'closed') {
    return mention ?? '';
  }

  return mention === null ? strings.cinema.curtainUp : `${strings.cinema.curtainUp} ${mention}`;
};

export const renderPickupMessage = (view: PickupView): PickupMessagePayload => {
  const locale = view.locale ?? DEFAULT_LOCALE;
  const strings = stringsFor(locale);
  const mentionRoleId = view.pickup.status === 'closed' ? null : view.mentionRoleId;

  return {
    content: renderContent(view, strings, mentionRoleId),
    embeds: [buildEmbed(view, strings)],
    components: buildComponents(view, strings, locale),
    allowedMentions: { parse: [], roles: mentionRoleId === null ? [] : [mentionRoleId] },
  };
};
