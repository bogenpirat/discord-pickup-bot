import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { planTarget, RIOT_ID_OPTION, resolveTarget } from '../discord/valorantTarget.ts';
import { summariseMatch } from '../domain/valorant/matchSummary.ts';
import { renderMatchSummary } from '../ui/matchSummary.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';
import { describeValorantError } from '../ui/valorantError.ts';
import type { Platform } from '../valorant/http.ts';

const PLATFORM: Platform = 'pc';

const definitionFor = (name: string, ephemeral: boolean) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(
      ephemeral
        ? 'Summarise your last Valorant match, visible only to you'
        : 'Summarise your last Valorant match',
    )
    .setDescriptionLocalizations({
      de: ephemeral
        ? 'Dein letztes Valorant-Match zusammenfassen, nur für dich sichtbar'
        : 'Dein letztes Valorant-Match zusammenfassen',
    })
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName(RIOT_ID_OPTION)
        .setNameLocalizations({ de: 'riot-id' })
        .setDescription('Look up another Riot ID instead — admins only')
        .setDescriptionLocalizations({ de: 'Andere Riot-ID abfragen — nur für Admins' })
        .setMaxLength(64)
        .setRequired(false),
    )
    .toJSON();

const executeFor =
  (ephemeral: boolean) =>
  async (interaction: ChatInputCommandInteraction, context: AppContext): Promise<void> => {
    const strings = stringsFor(resolveLocale(interaction.locale));

    if (!interaction.inGuild()) {
      await replyEphemeral(interaction, strings.guildOnly);
      return;
    }

    const client = context.valorant;
    if (client === null) {
      await replyEphemeral(interaction, strings.valorantNotConfigured);
      return;
    }

    const plan = planTarget(interaction, context, strings);
    if (plan.kind === 'refuse') {
      await replyEphemeral(interaction, plan.message);
      return;
    }

    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

    const resolved = await resolveTarget(plan, client, strings);
    if ('refusal' in resolved) {
      await interaction.editReply({ content: resolved.refusal });
      return;
    }

    // By puuid rather than by name: it is what the match records identify a
    // player by, and it does not go stale when someone renames.
    const matches = await client.getMatchesByPuuid(resolved.affinity, PLATFORM, resolved.puuid, {
      size: 1,
    });

    if (!matches.ok) {
      context.logger.warn({ err: matches.error, riotId: resolved.label }, 'match lookup failed');
      await interaction.editReply({
        content:
          matches.error.kind === 'not-found'
            ? strings.matchNone(resolved.label)
            : describeValorantError(matches.error, strings),
      });
      return;
    }

    const [latest] = matches.value;
    if (latest === undefined) {
      await interaction.editReply({ content: strings.matchNone(resolved.label) });
      return;
    }

    // No cast: the generated match type satisfies what the domain asks for, so an
    // upstream schema change breaks the build rather than the summary.
    const summary = summariseMatch(latest, resolved.puuid);
    if (summary === null) {
      context.logger.warn(
        { riotId: resolved.label, matchId: latest.metadata.match_id },
        'match did not contain the player it was fetched for',
      );
      await interaction.editReply({ content: strings.matchNone(resolved.label) });
      return;
    }

    await interaction.editReply({
      embeds: [renderMatchSummary(summary, strings).setAuthor({ name: resolved.label })],
    });
  };

/** One implementation, two commands — see the note on `createEloCommand`. */
export const createLastCommand = (name: string, ephemeral: boolean): SlashCommand => ({
  name,
  definition: definitionFor(name, ephemeral),
  execute: executeFor(ephemeral),
});

export const lastCommand: SlashCommand = createLastCommand('last', false);
export const lastPrivateCommand: SlashCommand = createLastCommand('last-private', true);
