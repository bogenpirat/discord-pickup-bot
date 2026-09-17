import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import {
  planTarget,
  RIOT_ID_OPTION,
  resolveTarget,
  type ValorantTarget,
} from '../discord/valorantTarget.ts';
import { buildMmrSeries, type MmrSeries } from '../domain/valorant/mmrSeries.ts';
import { renderMmrChart } from '../ui/mmrChart.ts';
import { resolveLocale, type Strings, stringsFor } from '../ui/strings.ts';
import { describeValorantError } from '../ui/valorantError.ts';
import type { ContentCatalog } from '../valorant/contentCatalog.ts';
import type { Platform, ValorantError } from '../valorant/http.ts';
import type { Mmr } from '../valorant/types.ts';

/**
 * The bot organises PC pickups, and every MMR endpoint requires a platform.
 * Console would need a per-account choice that nothing here can supply yet.
 */
const PLATFORM: Platform = 'pc';

const VALORANT_RED = 0xff4655;
const CHART_FILE = 'elo.png';

const definitionFor = (name: string, ephemeral: boolean) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(
      ephemeral
        ? 'Show your Valorant rank and its recent development, visible only to you'
        : 'Show your Valorant rank and how it moved over your recent matches',
    )
    .setDescriptionLocalizations({
      de: ephemeral
        ? 'Deinen Valorant-Rang und seine Entwicklung zeigen, nur für dich sichtbar'
        : 'Deinen Valorant-Rang zeigen und wie er sich zuletzt entwickelt hat',
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

const changeText = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;

const summaryLine = (series: MmrSeries, strings: Strings): string =>
  series.points.length === 0
    ? strings.eloNoHistory
    : strings.eloRecord({
        // Ranked matches only: an unrated match has no result the API will name
        // and no elo behind it, so counting it towards the record would put a
        // number next to a stretch the chart deliberately leaves undrawn.
        matches: series.ratedCount,
        wins: series.wins,
        losses: series.losses,
        net: changeText(series.netChange),
        unrated: series.points.length - series.ratedCount,
      });

const buildEmbed = (
  mmr: Mmr,
  series: MmrSeries,
  target: ValorantTarget,
  strings: Strings,
  content: ContentCatalog,
): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setColor(VALORANT_RED)
    .setTitle(target.label)
    .setImage(`attachment://${CHART_FILE}`)
    .addFields(
      {
        name: strings.eloRankLabel,
        value: strings.eloRankValue(mmr.current.tier.name, mmr.current.rr),
        inline: true,
      },
      {
        name: strings.eloLastChangeLabel,
        value: changeText(mmr.current.last_change),
        inline: true,
      },
    );

  if (mmr.peak != null) {
    embed.addFields({
      name: strings.eloPeakLabel,
      // `e5a1` is the only form the API sends, and it is a code rather than a
      // name. The content dump has the act it stands for, including the episode
      // — without which `ACT I` is one of eleven.
      value: strings.eloPeakValue(
        mmr.peak.tier.name,
        content.seasonLabel(mmr.peak.season.id) ?? mmr.peak.season.short,
      ),
      inline: true,
    });
  }

  if (mmr.current.leaderboard_placement != null) {
    embed.addFields({
      name: strings.eloLeaderboardLabel,
      value: `#${mmr.current.leaderboard_placement.rank}`,
      inline: true,
    });
  }

  return embed.setFooter({ text: summaryLine(series, strings) });
};

const describe = (error: ValorantError, label: string, strings: Strings): string =>
  error.kind === 'not-found'
    ? strings.eloNoRankedData(label)
    : describeValorantError(error, strings);

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

    // Deferred before the first call either way; only the visibility differs.
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

    const resolved = await resolveTarget(plan, client, strings);
    if ('refusal' in resolved) {
      await interaction.editReply({ content: resolved.refusal });
      return;
    }

    // Independent calls, so they queue together rather than one after the other.
    // The limiter still admits them one at a time, it just does not idle between.
    const [rank, history] = await Promise.all([
      client.getMmr(resolved.affinity, PLATFORM, resolved.name, resolved.tag),
      client.getMmrHistory(resolved.affinity, PLATFORM, resolved.name, resolved.tag),
    ]);

    if (!rank.ok) {
      context.logger.warn({ err: rank.error, riotId: resolved.label }, 'mmr lookup failed');
      await interaction.editReply({ content: describe(rank.error, resolved.label, strings) });
      return;
    }

    // A missing history is not fatal: the current rank is still worth showing,
    // and the chart says so in its own empty state.
    if (!history.ok) {
      context.logger.warn(
        { err: history.error, riotId: resolved.label },
        'mmr history lookup failed',
      );
    }
    const series = buildMmrSeries(history.ok ? history.value.history : []);

    const chart = renderMmrChart(series, {
      title: `${resolved.label} · ${rank.value.current.tier.name}`,
      subtitle: summaryLine(series, strings),
      empty: strings.eloNoHistory,
      unrated: strings.eloUnrated,
      unratedOnly: strings.eloUnratedOnly,
    });

    await interaction.editReply({
      embeds: [buildEmbed(rank.value, series, resolved, strings, context.content)],
      files: [new AttachmentBuilder(chart, { name: CHART_FILE })],
    });
  };

/**
 * One implementation, two commands. The private variant exists as its own
 * command rather than an option so it is one keystroke away, and so a member who
 * wants their rank kept quiet cannot post it publicly by forgetting a toggle.
 */
export const createEloCommand = (name: string, ephemeral: boolean): SlashCommand => ({
  name,
  definition: definitionFor(name, ephemeral),
  execute: executeFor(ephemeral),
});

export const eloCommand: SlashCommand = createEloCommand('elo', false);
export const eloPrivateCommand: SlashCommand = createEloCommand('elo-private', true);
