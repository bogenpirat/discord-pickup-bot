import { EmbedBuilder, TimestampStyles, time } from 'discord.js';
import { type LiveServerDetail, roundElapsedMs } from '../domain/wardogs/parseServerDetail.ts';
import { bannerUrl, serverPageUrl } from '../wardogs/client.ts';
import { formatDuration } from './matchSummary.ts';
import type { Strings } from './strings.ts';

const WARDOGS_OLIVE = 0x4b5320;

/** `DayLateGrayFog` → `Day Late Gray Fog`. */
export const humanizeSky = (sky: string): string => sky.replace(/([a-z])([A-Z])/g, '$1 $2');

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const buildWardogsEmbed = (
  detail: LiveServerDetail,
  strings: Strings,
  now: Temporal.Instant,
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

  if (server.imageUrl !== null && isHttpsUrl(server.imageUrl)) {
    embed.setThumbnail(server.imageUrl);
  }
  if (updatedAt !== null) {
    embed.setTimestamp(new Date(updatedAt.epochMilliseconds));
  }
  if (linkKey !== null) {
    embed.setURL(serverPageUrl(linkKey));
    // Versioned by the poll the data came from, which is when the card changes.
    const version = Math.floor((updatedAt ?? now).epochMilliseconds / 1000);
    embed.setImage(bannerUrl(linkKey, version));
  }

  return embed;
};
