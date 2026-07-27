import { MessageFlags, type RepliableInteraction } from 'discord.js';

export const replyEphemeral = async (
  interaction: RepliableInteraction,
  content: string,
): Promise<void> => {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
};
