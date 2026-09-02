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
 * Column widths, in monospace characters. What matters is the width of a whole
 * row: the embed often lands in the narrow chat beside a voice channel, where a
 * long row wraps and takes the scoreboard's alignment with it. The agent column
 * is measured rather than fixed, so nine-character Brimstone never costs a row
 * that has no Brimstone in it.
 */
const TIER_COLUMN = 3;
const KDA_COLUMN = 8;
const SCORE_COLUMN = 3;
/** Wide enough to read the numbers as separate columns rather than one string. */
const GAP = '  ';

interface Columns {
  readonly agent: number;
  /** False for the unrated modes, where a rank column would be all blanks. */
  readonly tier: boolean;
}

const padEnd = (value: string, width: number): string => value.padEnd(width, ' ');

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

// Measured across both sides at once, so the two scoreboards line up with each
// other and not just with themselves.
const columnsFor = (summary: MatchSummary): Columns => {
  const players = [...summary.allies.players, ...summary.enemies.players];

  return {
    agent: Math.max(0, ...players.map((player) => player.agent.length)),
    tier: players.some((player) => tierShortName(player.tierId) !== null),
  };
};

/**
 * A fixed-width scoreboard, because Discord's proportional font turns a column
 * of numbers into a staircase. The target's own line is marked so it can be
 * found at a glance.
 */
const scoreboard = (players: readonly MatchPlayerLine[], columns: Columns): string => {
  const rows = players.map((player) => {
    const kda = `${player.kills}/${player.deaths}/${player.assists}`;
    const tier = columns.tier ? padEnd(tierShortName(player.tierId) ?? '', TIER_COLUMN) : '';

    return [
      `${player.isTarget ? '>' : ' '} ${padEnd(player.agent, columns.agent)}`,
      tier,
      padStart(kda, KDA_COLUMN),
      padStart(player.acs, SCORE_COLUMN),
    ]
      .filter((cell) => cell !== '')
      .join(GAP);
  });

  return `\`\`\`\n${rows.join('\n')}\n\`\`\``;
};

// Full width, not two inline columns: side by side each scoreboard gets half an
// already narrow embed, which is where the wrapping starts.
const teamField = (label: string, team: MatchTeam, columns: Columns) => ({
  name: label,
  value: scoreboard(team.players, columns),
  inline: false,
});

export const renderMatchSummary = (summary: MatchSummary, strings: Strings): EmbedBuilder => {
  const target = summary.target;
  const headshots = target.headshotPercent === null ? strings.notSet : `${target.headshotPercent}%`;
  const columns = columnsFor(summary);

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
      teamField(strings.matchTeamLabel(summary.allies.averageTier), summary.allies, columns),
      teamField(strings.matchEnemyLabel(summary.enemies.averageTier), summary.enemies, columns),
    );

  // The full match, one click away, in place of a footer nobody could use the
  // id from. Discord rejects the embed outright if the url is not one, so a
  // match with no id keeps a plain title instead.
  if (summary.matchId !== '') {
    embed.setURL(trackerMatchUrl(summary.matchId));
  }

  return embed;
};
