import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TimestampStyles,
  time,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { canUseConfig } from '../discord/permissions.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { resolveLocale, type Strings, stringsFor } from '../ui/strings.ts';
import { describeValorantError } from '../ui/valorantError.ts';
import type { ValorantClient } from '../valorant/client.ts';

/** Cheap, key-authenticated and free of personal data — a good liveness probe. */
const PROBE_AFFINITY = 'eu';

const definition = new SlashCommandBuilder()
  .setName('valo-api')
  .setDescription('Inspect the Valorant API connection')
  .setDescriptionLocalizations({ de: 'Verbindung zur Valorant-API prüfen' })
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setNameLocalizations({ de: 'status' })
      .setDescription('Show rate-limit usage and probe the API')
      .setDescriptionLocalizations({ de: 'Limit-Auslastung zeigen und die API anpingen' }),
  );

const probe = async (client: ValorantClient, strings: Strings): Promise<string> => {
  const result = await client.getVersion(PROBE_AFFINITY);
  return result.ok
    ? strings.valorantProbeOk(result.value.version_for_api)
    : strings.valorantProbeFailed(describeValorantError(result.error, strings));
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));

  if (!interaction.inGuild()) {
    await replyEphemeral(interaction, strings.guildOnly);
    return;
  }

  // Same gate as the pickup config commands: Manage Server, a power user, or the
  // admin role a server set with `/pickup-config admin-role`.
  const settings = context.settings.get(interaction.guildId);
  if (!canUseConfig(interaction, settings, context.powerUserIds)) {
    await replyEphemeral(interaction, strings.missingPermission);
    return;
  }

  const client = context.valorant;
  if (client === null) {
    await replyEphemeral(interaction, strings.valorantNotConfigured);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Probed before reading the stats so the probe's own request is counted.
  const probeResult = await probe(client, strings);
  const stats = client.stats();

  await replyEphemeral(
    interaction,
    strings.valorantApiStatus({
      probe: probeResult,
      used: stats.used,
      limit: stats.limit,
      waiting: stats.waiting,
      requests: stats.requests,
      failures: stats.failures,
      rateLimitHits: stats.rateLimitHits,
      blocked:
        stats.blockedUntil === null
          ? strings.valorantNotBlocked
          : strings.valorantBlockedUntil(
              time(new Date(stats.blockedUntil), TimestampStyles.RelativeTime),
            ),
      lastRateLimited:
        stats.lastRateLimitedAt === null
          ? strings.never
          : time(new Date(stats.lastRateLimitedAt), TimestampStyles.RelativeTime),
    }),
  );
};

export const valoApiCommand: SlashCommand = {
  name: 'valo-api',
  definition: definition.toJSON(),
  execute,
};
