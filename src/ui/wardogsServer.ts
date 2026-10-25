import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TimestampStyles,
  time,
} from 'discord.js';
import { type LiveServerDetail, roundElapsedMs } from '../domain/wardogs/parseServerDetail.ts';
import { serverPageUrl } from '../wardogs/client.ts';
import { formatDuration } from './matchSummary.ts';
import type { Strings } from './strings.ts';

const WARDOGS_OLIVE = 0x4b5320;
const JOIN_EMOJI = '🎮';

/** `DayLateGrayFog` → `Day Late Gray Fog`. */
export const humanizeSky = (sky: string): string => sky.replace(/([a-z])([A-Z])/g, '$1 $2');

export const buildWardogsEmbed = (
  detail: LiveServerDetail,
  strings: Strings,
  now: Temporal.Instant,
  /** File name of an attached banner to show as the image, or null for none. */
  imageName: string | null,
): EmbedBuilder => {
  const { server, updatedAt, linkKey } = detail;
  const embed = new EmbedBuilder()
    .setColor(WARDOGS_OLIVE)
    .setTitle(server.name)
    .addFields(
      {
        name: strings.wdPlayersLabel,
        value: `${server.players}/${server.maxPlayers}`,
        inline: true,
      },
      { name: strings.wdMapLabel, value: `${server.map} (${server.world})`, inline: true },
      { name: strings.wdSkyLabel, value: humanizeSky(server.sky), inline: true },
    )
    .setFooter({ text: strings.wdFooter });

  if (server.passworded) {
    embed.setDescription(strings.wdPassworded);
  }

  // Measured against now rather than `updatedAt`: the start is an absolute
  // instant, so a cached response still yields the round's current length.
  const elapsed = roundElapsedMs(server.matchStart, now.epochMilliseconds);
  if (elapsed !== null && server.matchStart !== null) {
    embed.addFields({
      name: strings.wdRoundLabel,
      value: strings.wdRoundValue(
        formatDuration(elapsed),
        time(new Date(server.matchStart), TimestampStyles.ShortTime),
      ),
      inline: true,
    });
  }

  if (updatedAt !== null) {
    embed.setTimestamp(new Date(updatedAt.epochMilliseconds));
  }
  if (linkKey !== null) {
    embed.setURL(serverPageUrl(linkKey));
  }
  if (imageName !== null) {
    embed.setImage(`attachment://${imageName}`);
  }

  return embed;
};

/**
 * The join button, pointing at the bot's own redirect page since Discord does
 * not let a link button open `steam://`. None without a public base URL to
 * serve that page from.
 */
export const buildWardogsComponents = (
  joinUrl: string | null,
  strings: Strings,
): ActionRowBuilder<ButtonBuilder>[] =>
  joinUrl === null
    ? []
    : [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji(JOIN_EMOJI)
            .setLabel(strings.wdJoinButton)
            .setURL(joinUrl),
        ),
      ];
