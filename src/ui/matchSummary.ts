import { EmbedBuilder, TimestampStyles, time } from 'discord.js';
import type { MatchPlayerLine, MatchSummary, MatchTeam } from '../domain/valorant/matchSummary.ts';
import { tierShortName } from '../domain/valorant/tier.ts';
import type { Strings } from './strings.ts';

const COLOURS: Readonly<Record<MatchSummary['outcome'], number>> = {
  win: 0x4ade80,
  loss: 0xff4655,
  draw: 0x8f96a5,
};

const TRACKER_MATCH_URL = 'https://tracker.gg/valorant/match/';

/**
 * Column widths, in monospace characters. Their sum plus the separators is the
 * width of a row, and that is the number that matters: the embed often lands in
 * the narrow chat beside a voice channel, where a row wider than roughly thirty
 * characters wraps and takes the whole scoreboard's alignment with it.
 */
const NAME_COLUMN = 7;
/** Agents are cut rather than elided — five characters still name every one. */
const AGENT_COLUMN = 5;
const TIER_COLUMN = 3;
const KDA_COLUMN = 8;
const SCORE_COLUMN = 3;

const pad = (value: string, width: number): string =>
  value.length >= width ? value.slice(0, width) : value.padEnd(width, ' ');

/** Like `pad`, but says that it cut something — names are not guessable. */
const padName = (value: string, width: number): string =>
  value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width, ' ');

const padStart = (value: string | number, width: number): string =>
  String(value).padStart(width, ' ');

export const formatDuration = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
};

export const trackerMatchUrl = (matchId: string): string =>
  `${TRACKER_MATCH_URL}${encodeURIComponent(matchId)}`;

/**
 * A fixed-width scoreboard, because Discord's proportional font turns a column
 * of numbers into a staircase. The target's own line is marked so it can be
 * found at a glance.
 */
const scoreboard = (players: readonly MatchPlayerLine[]): string => {
  const rows = players.map((player) => {
    const kda = `${player.kills}/${player.deaths}/${player.assists}`;
    return [
      player.isTarget ? '>' : ' ',
      padName(player.name, NAME_COLUMN),
      pad(player.agent, AGENT_COLUMN),
      padStart(tierShortName(player.tierId), TIER_COLUMN),
      padStart(kda, KDA_COLUMN),
      padStart(player.acs, SCORE_COLUMN),
    ].join(' ');
  });

  return `\`\`\`\n${rows.join('\n')}\n\`\`\``;
};

// Full width, not two inline columns: side by side each scoreboard gets half an
// already narrow embed, which is where the wrapping starts.
const teamField = (label: string, team: MatchTeam) => ({
  name: label,
  value: scoreboard(team.players),
  inline: false,
});

export const renderMatchSummary = (summary: MatchSummary, strings: Strings): EmbedBuilder => {
  const target = summary.target;
  const headshots = target.headshotPercent === null ? strings.notSet : `${target.headshotPercent}%`;

  const embed = new EmbedBuilder()
    .setColor(COLOURS[summary.outcome])
    .setTitle(strings.matchTitle(summary.map, strings.matchOutcome[summary.outcome]))
    .setDescription(
      strings.matchHeadline({
        score: `${summary.roundsWon}–${summary.roundsLost}`,
        mode: summary.mode,
        // Rendered by Discord in each reader's own timezone.
        when: time(new Date(summary.startedAt), TimestampStyles.RelativeTime),
        duration: formatDuration(summary.durationMs),
      }),
    )
    .addFields(
      {
        name: strings.matchYouLabel(target.agent),
        value: strings.matchYouValue({
          kda: `${target.kills}/${target.deaths}/${target.assists}`,
          acs: target.acs,
          adr: target.adr,
          headshots,
        }),
      },
      teamField(strings.matchTeamLabel(summary.allies.averageTier), summary.allies),
      teamField(strings.matchEnemyLabel(summary.enemies.averageTier), summary.enemies),
    );

  // The full match, one click away, in place of a footer nobody could use the
  // id from. Discord rejects the embed outright if the url is not one, so a
  // match with no id keeps a plain title instead.
  if (summary.matchId !== '') {
    embed.setURL(trackerMatchUrl(summary.matchId));
  }

  return embed;
};
