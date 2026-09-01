import { describe, expect, it } from 'vitest';
import {
  type MatchInput,
  type MatchPlayerInput,
  summariseMatch,
} from '../../../src/domain/valorant/matchSummary.ts';

const player = (
  puuid: string,
  team: string,
  overrides: Partial<MatchPlayerInput['stats']> = {},
  agent = 'Jett',
): MatchPlayerInput => ({
  puuid,
  name: puuid.toUpperCase(),
  tag: 'EUW',
  team_id: team,
  agent: { name: agent },
  tier: { name: 'Immortal 2' },
  stats: {
    kills: 10,
    deaths: 10,
    assists: 5,
    score: 4400,
    headshots: 10,
    bodyshots: 30,
    legshots: 10,
    damage: { dealt: 3300, received: 3000 },
    ...overrides,
  },
});

const match = (overrides: Partial<MatchInput> = {}): MatchInput => ({
  metadata: {
    match_id: 'match-1',
    map: { name: 'Ascent' },
    started_at: '2026-09-01T18:00:00Z',
    game_length_in_ms: 2_400_000,
    queue: { name: 'Competitive', mode_type: 'Standard' },
  },
  players: [
    player('me', 'Red'),
    player('ally-1', 'Red', { score: 6600 }),
    player('ally-2', 'Red', { score: 2200 }),
    player('enemy-1', 'Blue', { score: 5500 }),
    player('enemy-2', 'Blue', { score: 1100 }),
  ],
  teams: [
    { team_id: 'Red', won: true, rounds: { won: 13, lost: 9 } },
    { team_id: 'Blue', won: false, rounds: { won: 9, lost: 13 } },
  ],
  ...overrides,
});

describe('summariseMatch', () => {
  it('returns null when the player is not in the match', () => {
    expect(summariseMatch(match(), 'stranger')).toBeNull();
  });

  it('reads the match metadata', () => {
    const summary = summariseMatch(match(), 'me');

    expect(summary).toMatchObject({
      matchId: 'match-1',
      map: 'Ascent',
      mode: 'Competitive',
      startedAt: Date.parse('2026-09-01T18:00:00Z'),
      durationMs: 2_400_000,
    });
  });

  it('falls back to the mode type when the queue has no name', () => {
    const summary = summariseMatch(
      match({
        metadata: { ...match().metadata, queue: { name: null, mode_type: 'Deathmatch' } },
      }),
      'me',
    );

    expect(summary?.mode).toBe('Deathmatch');
  });

  it('falls back again when the queue is absent entirely', () => {
    const summary = summariseMatch(
      match({ metadata: { ...match().metadata, queue: undefined } }),
      'me',
    );

    expect(summary?.mode).toBe('Unknown');
  });

  it('treats an unparseable start as the epoch rather than throwing', () => {
    const summary = summariseMatch(
      match({ metadata: { ...match().metadata, started_at: 'whenever' } }),
      'me',
    );

    expect(summary?.startedAt).toBe(0);
  });

  it('reports the score from the target team, in its own order', () => {
    const summary = summariseMatch(match(), 'me');

    expect(summary).toMatchObject({ outcome: 'win', roundsWon: 13, roundsLost: 9 });
  });

  it('reports a loss from the losing side of the same match', () => {
    const summary = summariseMatch(match(), 'enemy-1');

    expect(summary).toMatchObject({ outcome: 'loss', roundsWon: 9, roundsLost: 13 });
  });

  it('calls an equal scoreline a draw, whatever the won flag says', () => {
    const drawn = match({
      teams: [
        { team_id: 'Red', won: false, rounds: { won: 12, lost: 12 } },
        { team_id: 'Blue', won: false, rounds: { won: 12, lost: 12 } },
      ],
    });

    expect(summariseMatch(drawn, 'me')?.outcome).toBe('draw');
  });

  it('survives a team the match does not describe', () => {
    const orphaned = match({
      teams: [{ team_id: 'Blue', won: true, rounds: { won: 13, lost: 0 } }],
    });
    const summary = summariseMatch(orphaned, 'me');

    expect(summary).toMatchObject({ outcome: 'draw', roundsWon: 0, roundsLost: 0 });
  });

  it('splits the sides around the target', () => {
    const summary = summariseMatch(match(), 'me');

    expect(summary?.allies.map((line) => line.puuid).sort()).toEqual(['ally-1', 'ally-2', 'me']);
    expect(summary?.enemies.map((line) => line.puuid).sort()).toEqual(['enemy-1', 'enemy-2']);
  });

  it('sorts each side by combat score, best first', () => {
    const summary = summariseMatch(match(), 'me');

    expect(summary?.allies.map((line) => line.puuid)).toEqual(['ally-1', 'me', 'ally-2']);
    expect(summary?.enemies.map((line) => line.puuid)).toEqual(['enemy-1', 'enemy-2']);
  });

  it('marks exactly one line as the target, on both sides taken together', () => {
    const summary = summariseMatch(match(), 'me');
    const marked = [...(summary?.allies ?? []), ...(summary?.enemies ?? [])].filter(
      (line) => line.isTarget,
    );

    expect(marked.map((line) => line.puuid)).toEqual(['me']);
  });

  it('averages combat score and damage over the rounds played', () => {
    const summary = summariseMatch(match(), 'me');

    // 22 rounds: 4400 score and 3300 damage.
    expect(summary?.target.acs).toBe(200);
    expect(summary?.target.adr).toBe(150);
  });

  it('averages every player over the same round count', () => {
    const summary = summariseMatch(match(), 'me');

    expect(summary?.enemies.find((line) => line.puuid === 'enemy-1')?.acs).toBe(250);
  });

  it('does not divide by zero when no round was played', () => {
    const unplayed = match({
      teams: [
        { team_id: 'Red', won: false, rounds: { won: 0, lost: 0 } },
        { team_id: 'Blue', won: false, rounds: { won: 0, lost: 0 } },
      ],
    });
    const summary = summariseMatch(unplayed, 'me');

    expect(summary?.target.acs).toBe(0);
    expect(summary?.target.adr).toBe(0);
  });

  it('works out the headshot share of landed shots', () => {
    const summary = summariseMatch(match(), 'me');

    // 10 head of 50 landed.
    expect(summary?.target.headshotPercent).toBe(20);
  });

  it('reports no headshot share when nothing landed', () => {
    const whiffed = match({
      players: [
        player('me', 'Red', { headshots: 0, bodyshots: 0, legshots: 0 }),
        player('enemy-1', 'Blue'),
      ],
    });

    expect(summariseMatch(whiffed, 'me')?.target.headshotPercent).toBeNull();
  });

  it('carries the identity of each player through', () => {
    const summary = summariseMatch(match(), 'me');

    expect(summary?.target).toMatchObject({
      label: 'ME#EUW',
      agent: 'Jett',
      tier: 'Immortal 2',
      kills: 10,
      deaths: 10,
      assists: 5,
    });
  });

  it('survives a player with no rank', () => {
    const unranked = match({
      players: [player('me', 'Red'), player('enemy-1', 'Blue')].map((entry) => ({
        ...entry,
        tier: undefined,
      })),
    });

    expect(summariseMatch(unranked, 'me')?.target.tier).toBeNull();
  });
});
