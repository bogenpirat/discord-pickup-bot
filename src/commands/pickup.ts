import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { parseStartTime } from '../domain/time/parseStartTime.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

const TIME_SUGGESTIONS = [
  '20:30',
  '21 Uhr',
  'halb 9',
  'viertel vor 9',
  'in 30 Minuten',
  'morgen 20:30',
];

const definition = new SlashCommandBuilder()
  .setName('pickup')
  .setDescription('Call a pickup game')
  .setDescriptionLocalizations({ de: 'Ruf ein Pickup-Spiel aus' })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('time')
      .setNameLocalizations({ de: 'zeit' })
      .setDescription('When it starts, for example 20:30, halb 9, in 30 Minuten')
      .setDescriptionLocalizations({ de: 'Startzeit, z. B. 20:30, halb 9, in 30 Minuten' })
      .setAutocomplete(true)
      .setMaxLength(100)
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('note')
      .setNameLocalizations({ de: 'notiz' })
      .setDescription('Optional note shown in the message')
      .setDescriptionLocalizations({ de: 'Optionale Notiz, die im Post erscheint' })
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

  const rawTime = interaction.options.getString('time');
  const note = interaction.options.getString('note');

  let startsAt: number | null = null;
  let startsAtText: string | null = null;

  if (rawTime !== null && rawTime.trim() !== '') {
    const parsed = parseStartTime(rawTime, settings.timezone, context.now());
    if (parsed.ok) {
      startsAt = parsed.value.epochMilliseconds;
    } else {
      startsAtText = rawTime.trim();
    }
  }

  const pickupId = context.pickups.create({
    guildId: interaction.guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    startsAt,
    startsAtText,
    note,
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
      }),
    );
    context.pickups.attachMessage(pickupId, message.id);

    const notice = startsAtText === null ? '' : `\n${strings.timeNotUnderstood}`;
    await interaction.editReply({ content: `${strings.posted(message.url)}${notice}` });
  } catch (error) {
    context.pickups.remove(pickupId);
    context.logger.error({ err: error, guildId: interaction.guildId }, 'failed to post pickup');
    await interaction.editReply({ content: strings.channelUnavailable });
  }
};

export const pickupCommand: SlashCommand = {
  name: 'pickup',
  definition: definition.toJSON(),
  execute,
  autocomplete: async (interaction) => {
    const query = interaction.options.getFocused().toLowerCase();
    const matches = TIME_SUGGESTIONS.filter((suggestion) =>
      suggestion.toLowerCase().includes(query),
    );
    await interaction.respond(
      (matches.length > 0 ? matches : TIME_SUGGESTIONS).map((suggestion) => ({
        name: suggestion,
        value: suggestion,
      })),
    );
  },
};
