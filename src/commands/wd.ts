import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { parseServerKey } from '../domain/wardogs/serverKey.ts';
import { resolveLocale, type Strings, stringsFor } from '../ui/strings.ts';
import { buildWardogsEmbed } from '../ui/wardogsServer.ts';
import type { WardogsLookupResult } from '../wardogs/client.ts';

const SERVER_ID_OPTION = 'server-id';

const definition = new SlashCommandBuilder()
  .setName('wd')
  .setDescription('Show the live status of a Wardogs server')
  .setDescriptionLocalizations({ de: 'Den Live-Status eines Wardogs-Servers zeigen' })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName(SERVER_ID_OPTION)
      .setNameLocalizations({ de: 'server-id' })
      .setDescription('Community server GUID (join code)')
      .setDescriptionLocalizations({ de: 'GUID (Join-Code) des Community-Servers' })
      .setMaxLength(64)
      .setRequired(true),
  )
  .toJSON();

type LookupFailure = Exclude<WardogsLookupResult, { kind: 'live' }>;

const describeFailure = (result: LookupFailure, input: string, strings: Strings): string => {
  switch (result.kind) {
    case 'not-found':
      return strings.wdServerNotFound(input);
    case 'offline':
      return strings.wdServerOffline(input);
    case 'rate-limited':
      return strings.wdRateLimited;
    case 'invalid':
    case 'error':
      return strings.wdApiUnavailable;
  }
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));
  const input = interaction.options.getString(SERVER_ID_OPTION, true).trim();

  const key = parseServerKey(input);
  if (key === null) {
    await replyEphemeral(interaction, strings.wdInvalidServerId(input));
    return;
  }

  // Public on purpose: the point is to show the server to the channel.
  await interaction.deferReply();

  const result = await context.wardogs.getServerDetail(key);
  if (result.kind !== 'live') {
    // Not-found and offline are answers about the server, not trouble with the API.
    if (result.kind !== 'not-found' && result.kind !== 'offline') {
      context.logger.warn({ result: result.kind, key }, 'wardogs lookup failed');
    }
    await interaction.editReply({ content: describeFailure(result, input, strings) });
    return;
  }

  await interaction.editReply({
    embeds: [buildWardogsEmbed(result, strings, context.now())],
  });
};

export const wdCommand: SlashCommand = { name: 'wd', definition, execute };
