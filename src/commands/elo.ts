import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { canUseConfig } from '../discord/permissions.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { buildMmrSeries, type MmrSeries } from '../domain/valorant/mmrSeries.ts';
import { formatRiotId, parseRiotId } from '../domain/valorant/riotId.ts';
import { renderMmrChart } from '../ui/mmrChart.ts';
import { resolveLocale, type Strings, stringsFor } from '../ui/strings.ts';
import { describeValorantError } from '../ui/valorantError.ts';
import type { ValorantClient } from '../valorant/client.ts';
import type { Affinity, Platform, ValorantError } from '../valorant/http.ts';
import type { Mmr } from '../valorant/types.ts';

/**
 * The bot organises PC pickups, and every MMR endpoint requires a platform.
 * Console would need a per-account choice that nothing here can supply yet.
 */
const PLATFORM: Platform = 'pc';

const VALORANT_RED = 0xff4655;
const CHART_FILE = 'elo.png';

const definition = new SlashCommandBuilder()
  .setName('elo')
  .setDescription('Show your Valorant rank and how it moved over your recent matches')
  .setDescriptionLocalizations({
    de: 'Deinen Valorant-Rang zeigen und wie er sich zuletzt entwickelt hat',
  })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('riot-id')
      .setNameLocalizations({ de: 'riot-id' })
      .setDescription('Look up another Riot ID instead — admins only')
      .setDescriptionLocalizations({ de: 'Andere Riot-ID abfragen — nur für Admins' })
      .setMaxLength(64)
      .setRequired(false),
  );

interface Target {
  readonly affinity: Affinity;
  readonly name: string;
  readonly tag: string;
  readonly label: string;
}

/**
 * What the command will do, decided before anything is deferred. Every refusal
 * that needs no network call is reachable from here, so it can be answered
 * ephemerally instead of leaving a public "thinking" message behind.
 */
type Plan =
  | { readonly kind: 'refuse'; readonly message: string }
  | { readonly kind: 'self'; readonly target: Target }
  | { readonly kind: 'lookup'; readonly name: string; readonly tag: string };

const changeText = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;

const summaryLine = (series: MmrSeries, strings: Strings): string =>
  series.points.length === 0
    ? strings.eloNoHistory
    : strings.eloRecord({
        matches: series.points.length,
        wins: series.wins,
        losses: series.losses,
        net: changeText(series.netChange),
      });

const targetFrom = (name: string, tag: string, region: string): Target => ({
  affinity: region as Affinity,
  name,
  tag,
  label: formatRiotId({ name, tag }),
});

const planFor = (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
  strings: Strings,
): Plan => {
  const raw = interaction.options.getString('riot-id');

  if (raw === null || raw.trim() === '') {
    const account = context.riotAccounts.find(interaction.user.id);
    return account === undefined
      ? { kind: 'refuse', message: strings.riotAccountNotLinked }
      : {
          kind: 'self',
          target: targetFrom(account.riotName, account.riotTag, account.region),
        };
  }

  // Looking up a stranger spends the bot's rate limit on someone who never opted
  // in, so it needs the same standing as the other admin commands.
  const guildId = interaction.guildId;
  const allowed =
    guildId !== null &&
    canUseConfig(interaction, context.settings.get(guildId), context.powerUserIds);

  if (!allowed) {
    return { kind: 'refuse', message: strings.eloRiotIdAdminOnly };
  }

  const parsed = parseRiotId(raw);
  return parsed.ok
    ? { kind: 'lookup', name: parsed.value.name, tag: parsed.value.tag }
    : {
        kind: 'refuse',
        message: strings.invalidRiotId(raw.trim(), strings.riotIdProblem[parsed.error]),
      };
};

const buildEmbed = (
  mmr: Mmr,
  series: MmrSeries,
  target: Target,
  strings: Strings,
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
      value: strings.eloPeakValue(mmr.peak.tier.name, mmr.peak.season.short),
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

/** Resolves a bare Riot ID to a target, since MMR endpoints need its region. */
const lookupTarget = async (
  client: ValorantClient,
  name: string,
  tag: string,
  strings: Strings,
): Promise<Target | { readonly refusal: string }> => {
  const account = await client.getAccount(name, tag);

  if (!account.ok) {
    return {
      refusal:
        account.error.kind === 'not-found'
          ? strings.riotAccountNotFound(formatRiotId({ name, tag }))
          : describeValorantError(account.error, strings),
    };
  }

  return targetFrom(account.value.name, account.value.tag, account.value.region);
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

  const client = context.valorant;
  if (client === null) {
    await replyEphemeral(interaction, strings.valorantNotConfigured);
    return;
  }

  const plan = planFor(interaction, context, strings);
  if (plan.kind === 'refuse') {
    await replyEphemeral(interaction, plan.message);
    return;
  }

  // Public from here on: the chart is the point, and it is meant to be shared.
  await interaction.deferReply();

  const resolved =
    plan.kind === 'self' ? plan.target : await lookupTarget(client, plan.name, plan.tag, strings);

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

  // A missing history is not fatal: the current rank is still worth showing, and
  // the chart says so in its own empty state.
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
  });

  await interaction.editReply({
    embeds: [buildEmbed(rank.value, series, resolved, strings)],
    files: [new AttachmentBuilder(chart, { name: CHART_FILE })],
  });
};

export const eloCommand: SlashCommand = {
  name: 'elo',
  definition: definition.toJSON(),
  execute,
};
