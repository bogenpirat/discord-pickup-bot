import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { extractStartTime } from '../domain/time/extract.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

const definition = new SlashCommandBuilder()
  .setName('valo')
  .setDescription('Call a pickup game')
  .setDescriptionLocalizations({ de: 'Ruf eine Valorant-Runde aus' })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('info')
      .setDescription('Free text, any time in it is picked up automatically')
      .setDescriptionLocalizations({
        de: 'Freitext, eine enthaltene Uhrzeit wird automatisch erkannt',
      })
      .setMaxLength(200)
      .setRequired(false),
  );

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));

  if (!interaction.inGuild() || interaction.guild === null) {
    await replyEphemeral(interaction, strings.guildOnly);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = context.settings.get(interaction.guildId);
  if (settings.pickupChannelId === null) {
    await interaction.editReply({ content: strings.noChannelConfigured });
    return;
  }

  const channel = await interaction.guild.channels
    .fetch(settings.pickupChannelId)
    .catch(() => null);
  if (channel === null || !channel.isTextBased() || !channel.isSendable()) {
    await interaction.editReply({ content: strings.channelUnavailable });
    return;
  }

  const info = interaction.options.getString('info') ?? '';
  const extracted = extractStartTime(info, settings.timezone, context.now());

  const pickupId = context.pickups.create({
    guildId: interaction.guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    startsAt: extracted.startsAt === null ? null : extracted.startsAt.epochMilliseconds,
    startsAtText: null,
    note: extracted.note,
  });

  const pickup = context.pickups.findById(pickupId);
  if (pickup === undefined) {
    await interaction.editReply({ content: strings.unexpectedError });
    return;
  }

  try {
    const message = await channel.send(
      renderPickupMessage({
        pickup,
        responses: [],
        mentionRoleId: settings.mentionRoleId,
        emojis: settings.emojis,
      }),
    );
    context.pickups.attachMessage(pickupId, message.id);

    const notice =
      info.trim() !== '' && extracted.startsAt === null ? `\n${strings.noTimeFound}` : '';
    await interaction.editReply({ content: `${strings.posted(message.url)}${notice}` });
  } catch (error) {
    context.pickups.remove(pickupId);
    context.logger.error({ err: error, guildId: interaction.guildId }, 'failed to post pickup');
    await interaction.editReply({ content: strings.channelUnavailable });
  }
};

export const valoCommand: SlashCommand = {
  name: 'valo',
  definition: definition.toJSON(),
  execute,
};
