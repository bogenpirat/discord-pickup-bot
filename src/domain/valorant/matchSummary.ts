import { averageTierName } from './tier.ts';

/**
 * The shape this module needs out of a v4 match, named structurally so the
 * domain does not depend on the generated API types.
 */
export interface MatchPlayerInput {
  readonly puuid: string;
  readonly name: string;
  readonly tag: string;
  readonly team_id: string;
  readonly agent: { readonly name: string };
  readonly tier?: { readonly id?: number; readonly name?: string } | undefined;
  readonly stats: {
    readonly kills: number;
    readonly deaths: number;
    readonly assists: number;
    readonly score: number;
    readonly headshots: number;
    readonly bodyshots: number;
    readonly legshots: number;
    readonly damage: { readonly dealt: number; readonly received: number };
  };
}

export interface MatchInput {
  readonly metadata: {
    readonly match_id: string;
    readonly map: { readonly name: string };
    readonly started_at: string;
    readonly game_length_in_ms: number;
    readonly queue?:
      | { readonly name?: string | null; readonly mode_type?: string | null }
      | undefined;
  };
  readonly players: readonly MatchPlayerInput[];
  readonly teams: readonly {
    readonly team_id: string;
    readonly won: boolean;
    readonly rounds: { readonly won: number; readonly lost: number };
  }[];
}

export interface MatchPlayerLine {
  readonly puuid: string;
  readonly label: string;
  readonly agent: string;
  readonly tier: string | null;
  /** The rank as a ladder position, which is what an average can be taken of. */
  readonly tierId: number | null;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  /** Average combat score, the number the in-game scoreboard ranks by. */
  readonly acs: number;
  /** Average damage per round. */
  readonly adr: number;
  /** Whole percent, or null when the player never landed a shot. */
  readonly headshotPercent: number | null;
  readonly isTarget: boolean;
}

/** One side of the match, best combat score first. */
export interface MatchTeam {
  readonly players: readonly MatchPlayerLine[];
  /** The side's mean rank, or null when the API ranked nobody on it. */
  readonly averageTier: string | null;
}

export type MatchOutcome = 'win' | 'loss' | 'draw';

export interface MatchSummary {
  readonly matchId: string;
  readonly map: string;
  readonly mode: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly outcome: MatchOutcome;
  readonly roundsWon: number;
  readonly roundsLost: number;
  readonly target: MatchPlayerLine;
  /** The target's side, including the target. */
  readonly allies: MatchTeam;
  readonly enemies: MatchTeam;
}

const UNKNOWN_MODE = 'Unknown';

const percent = (part: number, whole: number): number | null =>
  whole <= 0 ? null : Math.round((part / whole) * 100);

const perRound = (total: number, rounds: number): number =>
  rounds <= 0 ? 0 : Math.round(total / rounds);

const lineFor = (
  player: MatchPlayerInput,
  rounds: number,
  targetPuuid: string,
): MatchPlayerLine => {
  const shots = player.stats.headshots + player.stats.bodyshots + player.stats.legshots;

  return {
    puuid: player.puuid,
    label: `${player.name}#${player.tag}`,
    agent: player.agent.name,
    tier: player.tier?.name ?? null,
    tierId: player.tier?.id ?? null,
    kills: player.stats.kills,
    deaths: player.stats.deaths,
    assists: player.stats.assists,
    acs: perRound(player.stats.score, rounds),
    adr: perRound(player.stats.damage.dealt, rounds),
    headshotPercent: percent(player.stats.headshots, shots),
    isTarget: player.puuid === targetPuuid,
  };
};

const byCombatScore = (a: MatchPlayerLine, b: MatchPlayerLine): number => b.acs - a.acs;

const teamOf = (players: readonly MatchPlayerLine[]): MatchTeam => ({
  players: [...players].sort(byCombatScore),
  averageTier: averageTierName(players.map((player) => player.tierId)),
});

const timeOf = (date: string): number => {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Reduces a match to the one player's view of it.
 *
 * Null when that player is not in the match, which the API should never answer
 * but which would otherwise be reported as a scoreline of nothing against
 * nothing.
 */
export const summariseMatch = (match: MatchInput, puuid: string): MatchSummary | null => {
  const player = match.players.find((entry) => entry.puuid === puuid);
  if (player === undefined) {
    return null;
  }

  const ownTeam = match.teams.find((team) => team.team_id === player.team_id);
  const roundsWon = ownTeam?.rounds.won ?? 0;
  const roundsLost = ownTeam?.rounds.lost ?? 0;
  // Both sides play the same rounds, so this is the divisor for every player's
  // per-round average, not just the target's.
  const rounds = roundsWon + roundsLost;

  // Kept paired with the player it came from, so the sides can be split without
  // indexing two arrays in step.
  const lines = match.players.map((entry) => ({
    line: lineFor(entry, rounds, puuid),
    ally: entry.team_id === player.team_id,
  }));

  const sideOf = (ally: boolean): MatchTeam =>
    teamOf(lines.filter((entry) => entry.ally === ally).map((entry) => entry.line));

  // A team the match does not describe leaves the score at 0-0, so it is already
  // a draw by the round count; naming it here keeps `won` off an optional read.
  const outcome: MatchOutcome =
    ownTeam === undefined || roundsWon === roundsLost ? 'draw' : ownTeam.won ? 'win' : 'loss';

  return {
    matchId: match.metadata.match_id,
    map: match.metadata.map.name,
    mode: match.metadata.queue?.name ?? match.metadata.queue?.mode_type ?? UNKNOWN_MODE,
    startedAt: timeOf(match.metadata.started_at),
    durationMs: match.metadata.game_length_in_ms,
    outcome,
    roundsWon,
    roundsLost,
    target: lineFor(player, rounds, puuid),
    allies: sideOf(true),
    enemies: sideOf(false),
  };
};
