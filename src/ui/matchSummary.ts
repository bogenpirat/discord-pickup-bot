import { EmbedBuilder, TimestampStyles, time } from 'discord.js';
import type { MatchPlayerLine, MatchSummary } from '../domain/valorant/matchSummary.ts';
import type { Strings } from './strings.ts';

const COLOURS: Readonly<Record<MatchSummary['outcome'], number>> = {
  win: 0x4ade80,
  loss: 0xff4655,
  draw: 0x8f96a5,
};

/** Widest agent name Riot ships, so the scoreboard columns line up. */
const AGENT_COLUMN = 9;

const pad = (value: string, width: number): string =>
  value.length >= width ? value.slice(0, width) : value.padEnd(width, ' ');

const padStart = (value: string | number, width: number): string =>
  String(value).padStart(width, ' ');

export const formatDuration = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
};

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
      pad(player.agent, AGENT_COLUMN),
      padStart(kda, 8),
      padStart(player.acs, 4),
    ].join(' ');
  });

  return `\`\`\`\n${rows.join('\n')}\n\`\`\``;
};

export const renderMatchSummary = (summary: MatchSummary, strings: Strings): EmbedBuilder => {
  const target = summary.target;
  const headshots = target.headshotPercent === null ? strings.notSet : `${target.headshotPercent}%`;

  return new EmbedBuilder()
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
      { name: strings.matchTeamLabel, value: scoreboard(summary.allies), inline: true },
      { name: strings.matchEnemyLabel, value: scoreboard(summary.enemies), inline: true },
    )
    .setFooter({ text: summary.matchId });
};
