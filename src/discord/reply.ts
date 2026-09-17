import { type EmbedBuilder, MessageFlags, type RepliableInteraction } from 'discord.js';

export const replyEphemeral = async (
  interaction: RepliableInteraction,
  content: string,
  embeds: readonly EmbedBuilder[] = [],
): Promise<void> => {
  const payload = {
    content,
    ...(embeds.length === 0 ? {} : { embeds }),
    flags: MessageFlags.Ephemeral as const,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
};
