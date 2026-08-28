import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { PickupRecord } from '../db/repositories/pickupRepository.ts';
import { canUseConfig } from '../discord/permissions.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { parseStartTime } from '../domain/time/parseStartTime.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

const definition = new SlashCommandBuilder()
  .setName('valo-time')
  .setDescription('Change the start time of the last pickup')
  .setDescriptionLocalizations({ de: 'Ändere die Startzeit des letzten Pickups' })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('time')
      .setDescription('For example 20:30, sunday 8pm, in 90 minutes')
      .setDescriptionLocalizations({ de: 'Zum Beispiel 20:30, Sonntag 20 Uhr, in 90 Minuten' })
      .setMaxLength(100)
      .setRequired(true),
  );

/**
 * Resolves the message a pickup was posted as, so the embed can be rewritten in
 * place. Returns null when the channel or message is gone.
 */
const fetchPickupMessage = async (
  interaction: ChatInputCommandInteraction,
  pickup: PickupRecord,
) => {
  if (interaction.guild === null || pickup.messageId === null) {
    return null;
  }

  const channel = await interaction.guild.channels.fetch(pickup.channelId).catch(() => null);
  if (channel === null || !channel.isTextBased()) {
    return null;
  }

  return await channel.messages.fetch(pickup.messageId).catch(() => null);
};

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

  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;
  // Pickups can now sit in any channel, so "the last pickup" only means the
  // last one in this channel — editing one the caller cannot see would be worse
  // than saying there is nothing here.
  const latest =
    interaction.channelId === null
      ? undefined
      : context.pickups.findLatestPosted(guildId, interaction.channelId);
  if (latest === undefined) {
    await interaction.editReply({ content: strings.noPickupToEdit });
    return;
  }

  const settings = context.settings.get(guildId);

  await context.mutex.runExclusive(`pickup:${latest.id}`, async () => {
    const pickup = context.pickups.findById(latest.id);
    if (pickup === undefined) {
      await interaction.editReply({ content: strings.pickupNotFound });
      return;
    }

    const isCreator = pickup.creatorId === interaction.user.id;
    if (!isCreator && !canUseConfig(interaction, settings, context.powerUserIds)) {
      await interaction.editReply({ content: strings.notAllowedToEditTime });
      return;
    }

    if (pickup.status === 'closed') {
      await interaction.editReply({ content: strings.pickupAlreadyClosed });
      return;
    }

    const message = await fetchPickupMessage(interaction, pickup);
    if (message === null) {
      await interaction.editReply({ content: strings.channelUnavailable });
      return;
    }

    const raw = interaction.options.getString('time', true).trim();
    const parsed = parseStartTime(raw, settings.timezone, context.now());

    // An unreadable time is kept verbatim rather than dropped, so the pickup
    // still says something about when it starts.
    context.pickups.setStart(
      pickup.id,
      parsed.ok ? parsed.value.epochMilliseconds : null,
      parsed.ok ? null : raw,
    );

    const updated = context.pickups.findById(pickup.id) ?? pickup;

    try {
      await message.edit(
        renderPickupMessage({
          pickup: updated,
          responses: context.responses.listByPickup(pickup.id),
          mentionRoleId: settings.mentionRoleId,
          emojis: settings.emojis,
          guildName,
          publicBaseUrl: context.publicBaseUrl,
        }),
      );
    } catch (error) {
      context.logger.error({ err: error, guildId, pickupId: pickup.id }, 'failed to edit pickup');
      await interaction.editReply({ content: strings.channelUnavailable });
      return;
    }

    const notice = parsed.ok ? '' : `\n${strings.timeNotUnderstood}`;
    await interaction.editReply({ content: `${strings.timeUpdated(message.url)}${notice}` });
  });
};

export const valoTimeCommand: SlashCommand = {
  name: 'valo-time',
  definition: definition.toJSON(),
  execute,
};
