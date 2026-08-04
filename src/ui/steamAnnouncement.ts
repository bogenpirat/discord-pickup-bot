import { EmbedBuilder } from 'discord.js';
import type { SteamAppDetails } from '../domain/steam/parseAppDetails.ts';
import { type AppLocale, DEFAULT_LOCALE, stringsFor } from './strings.ts';

const STEAM_BLUE = 0x1b2838;

export interface SteamAnnouncementPayload {
  readonly content: string;
  readonly embeds: EmbedBuilder[];
  readonly allowedMentions: { readonly parse: []; readonly roles: [] };
}

export const renderSteamReleaseMessage = (
  details: SteamAppDetails,
  locale: AppLocale = DEFAULT_LOCALE,
): SteamAnnouncementPayload => {
  const strings = stringsFor(locale);

  const embed = new EmbedBuilder()
    .setTitle(details.name)
    .setURL(details.storeUrl)
    .setColor(STEAM_BLUE)
    .setImage(details.headerImage);

  if (details.price !== null) {
    embed.addFields({
      name: strings.steamPriceLabel,
      value: details.price.finalFormatted,
      inline: true,
    });
  }

  return {
    content: strings.steamReleasedContent(details.name),
    embeds: [embed],
    allowedMentions: { parse: [], roles: [] },
  };
};
