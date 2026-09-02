import { EmbedBuilder } from 'discord.js';

const VALORANT_RED = 0xff4655;

export interface PlayerCardArtwork {
  readonly imageUrl: string;
  /** The card's own name, when the content dump has been read and knows it. */
  readonly name: string | null;
}

/**
 * The player card as a thumbnail, to be attached beside a reply that already
 * says everything in words.
 *
 * A thumbnail rather than an image: this rides along with an ephemeral
 * confirmation, where the full portrait would be several times the height of
 * the text it belongs to. The embed carries no description of its own for the
 * same reason — the message content is the message.
 */
export const playerCardEmbed = (card: PlayerCardArtwork): EmbedBuilder => {
  const embed = new EmbedBuilder().setColor(VALORANT_RED).setThumbnail(card.imageUrl);

  // Named only when the dump can name it, so a missing content load costs the
  // caption and leaves the picture.
  return card.name === null ? embed : embed.setFooter({ text: card.name });
};
