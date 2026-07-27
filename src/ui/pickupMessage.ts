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
import { PICKUP_CHOICES, type PickupChoice } from '../domain/pickupChoice.ts';
import { groupByChoice, type ResponseSet, tally } from '../domain/pickupState.ts';
import { type AppLocale, DEFAULT_LOCALE, type Strings, stringsFor } from './strings.ts';

const MAX_NAMES = 15;
const FIELD_LIMIT = 1024;

const BUTTON_STYLES: Readonly<Record<PickupChoice, ButtonStyle>> = {
  in: ButtonStyle.Success,
  ifMore: ButtonStyle.Primary,
  out: ButtonStyle.Secondary,
};

export interface PickupView {
  readonly pickup: PickupRecord;
  readonly responses: ResponseSet;
  readonly mentionRoleId: string | null;
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

const buildEmbed = (view: PickupView, strings: Strings): EmbedBuilder => {
  const groups = groupByChoice(view.responses);
  const embed = new EmbedBuilder()
    .setTitle(view.pickup.note === null ? strings.title : `${strings.title} — ${view.pickup.note}`)
    .setColor(view.pickup.status === 'closed' ? 0x71767b : 0x5865f2)
    .setFooter({
      text: view.pickup.status === 'closed' ? strings.closedFooter : strings.openFooter,
    });

  const lines = [`${strings.organizer}: ${userMention(view.pickup.creatorId)}`];

  if (view.pickup.startsAt !== null) {
    const startsAt = new Date(view.pickup.startsAt);
    lines.push(
      `${strings.startsAt}: ${time(startsAt, TimestampStyles.ShortTime)} (${time(startsAt, TimestampStyles.RelativeTime)})`,
    );
  } else if (view.pickup.startsAtText !== null) {
    lines.push(`${strings.startsAt}: ${view.pickup.startsAtText}`);
  }

  embed.setDescription(lines.join('\n'));

  for (const choice of PICKUP_CHOICES) {
    const group = groups[choice];
    embed.addFields({
      name: `${strings.choiceField[choice]} (${group.length})`,
      value: renderNames(group, strings),
      inline: true,
    });
  }

  return embed;
};

const buildComponents = (view: PickupView, strings: Strings): ActionRowBuilder<ButtonBuilder>[] => {
  const counts = tally(view.responses);
  const disabled = view.pickup.status === 'closed';

  const responseRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...PICKUP_CHOICES.map((choice) =>
      new ButtonBuilder()
        .setCustomId(encodeRespond(choice, view.pickup.id))
        .setLabel(`${strings.choice[choice]} · ${counts[choice]}`)
        .setStyle(BUTTON_STYLES[choice])
        .setDisabled(disabled),
    ),
  );

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeClose(view.pickup.id))
      .setLabel(strings.closeButton)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  return [responseRow, closeRow];
};

export const renderPickupMessage = (view: PickupView): PickupMessagePayload => {
  const strings = stringsFor(view.locale ?? DEFAULT_LOCALE);
  const mentionRoleId = view.pickup.status === 'closed' ? null : view.mentionRoleId;

  return {
    content: mentionRoleId === null ? '' : roleMention(mentionRoleId),
    embeds: [buildEmbed(view, strings)],
    components: buildComponents(view, strings),
    allowedMentions: { parse: [], roles: mentionRoleId === null ? [] : [mentionRoleId] },
  };
};
