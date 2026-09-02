import { describe, expect, it } from 'vitest';
import type {
  MatchPlayerLine,
  MatchSummary,
  MatchTeam,
} from '../../src/domain/valorant/matchSummary.ts';
import { formatDuration, renderMatchSummary, trackerMatchUrl } from '../../src/ui/matchSummary.ts';
import { stringsFor } from '../../src/ui/strings.ts';

const de = stringsFor('de');

const line = (
  name: string,
  agent: string,
  acs: number,
  isTarget = false,
  tierId: number | null = 25,
): MatchPlayerLine => ({
  puuid: name,
  name,
  label: `${name}#EUW`,
  agent,
  tier: 'Immortal 2',
  tierId,
  kills: 21,
  deaths: 14,
  assists: 6,
  acs,
  adr: 180,
  headshotPercent: 24,
  isTarget,
});

const team = (
  players: readonly MatchPlayerLine[],
  averageTier: string | null = 'Immortal 2',
): MatchTeam => ({ players, averageTier });

const summary = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
  matchId: 'match-abc',
  map: 'Ascent',
  mode: 'Competitive',
  startedAt: Date.parse('2026-09-01T18:00:00Z'),
  durationMs: 2_400_000,
  outcome: 'win',
  roundsWon: 13,
  roundsLost: 9,
  target: line('me', 'Jett', 260, true),
  allies: team([line('ally', 'Omen', 300), line('me', 'Jett', 260, true)]),
  enemies: team([line('foe', 'Sova', 220)]),
  ...overrides,
});

const dataOf = (value: MatchSummary) => renderMatchSummary(value, de).data;

const fieldsOf = (value: MatchSummary) =>
  dataOf(value)['fields'] as { name: string; value: string; inline?: boolean }[];

const rowsOf = (field: { value: string } | undefined): string[] =>
  (field?.value ?? '').split('\n').filter((row) => /\d+\/\d+\/\d+/.test(row));

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [59_000, '1m'],
    [2_400_000, '40m'],
    [3_600_000, '1h 0m'],
    [5_400_000, '1h 30m'],
  ])('renders %ims as %o', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('never renders a negative duration', () => {
    expect(formatDuration(-5_000)).toBe('0m');
  });
});

describe('renderMatchSummary', () => {
  it('titles with the map and the outcome', () => {
    expect(dataOf(summary())['title']).toBe('Ascent · Sieg');
  });

  it.each([
    ['win', 0x4ade80],
    ['loss', 0xff4655],
    ['draw', 0x8f96a5],
  ] as const)('colours a %s', (outcome, colour) => {
    expect(dataOf(summary({ outcome }))['color']).toBe(colour);
  });

  it('puts the score, mode and duration in the headline', () => {
    const description = String(dataOf(summary())['description']);

    expect(description).toContain('13–9');
    expect(description).toContain('Competitive');
    expect(description).toContain('40m');
  });

  it('renders the start as a discord timestamp, not a fixed string', () => {
    const description = String(dataOf(summary())['description']);

    expect(description).toMatch(/<t:\d+:R>/);
  });

  it('leads with the target own line', () => {
    const fields = fieldsOf(summary());

    expect(fields[0]?.name).toContain('Jett');
    expect(fields[0]?.value).toContain('21/14/6');
    expect(fields[0]?.value).toContain('260 ACS');
    expect(fields[0]?.value).toContain('24%');
  });

  it('says so rather than printing a percent when nothing landed', () => {
    const blind = summary({
      target: { ...line('me', 'Jett', 0, true), headshotPercent: null },
    });

    expect(fieldsOf(blind)[0]?.value).toContain(de.notSet);
  });

  it('renders both scoreboards as fixed-width blocks', () => {
    const fields = fieldsOf(summary());

    for (const index of [1, 2]) {
      expect(fields[index]?.value.startsWith('```')).toBe(true);
      expect(fields[index]?.value.endsWith('```')).toBe(true);
    }
  });

  it('stacks the scoreboards rather than putting them side by side', () => {
    const fields = fieldsOf(summary());

    expect(fields[1]?.inline).toBe(false);
    expect(fields[2]?.inline).toBe(false);
  });

  it('marks only the target row', () => {
    const rows = (fieldsOf(summary())[1]?.value ?? '')
      .split('\n')
      .filter((row) => row.startsWith('>'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Jett');
  });

  it('names each player and their rank on their row', () => {
    const rows = rowsOf(fieldsOf(summary())[1]);

    expect(rows[0]).toContain('ally');
    // Immortal 2, in the three characters the column allows.
    expect(rows[0]).toContain('Im2');
  });

  it('holds a place in the rank column for an unranked player', () => {
    const unranked = summary({ allies: team([line('ally', 'Omen', 300, false, null)], null) });
    const rows = rowsOf(fieldsOf(unranked)[1]);

    expect(rows[0]).toContain('—');
  });

  it('puts each side average rank in its heading', () => {
    const fields = fieldsOf(summary());

    expect(fields[1]?.name).toBe('Dein Team · Ø Immortal 2');
    expect(fields[2]?.name).toBe('Gegner · Ø Immortal 2');
  });

  it('leaves the heading bare when the side has no average rank', () => {
    const unranked = summary({ allies: team([line('ally', 'Omen', 300, false, null)], null) });

    expect(fieldsOf(unranked)[1]?.name).toBe('Dein Team');
  });

  it('keeps the scoreboard columns aligned whatever the agent name', () => {
    const wide = summary({
      allies: team([line('a', 'Killjoy', 300), line('me', 'Iso', 260, true)]),
    });
    const rows = rowsOf(fieldsOf(wide)[1]);

    const kdaColumns = rows.map((row) => row.indexOf('21/14/6'));
    expect(new Set(kdaColumns).size).toBe(1);
  });

  // The embed is often read in the narrow chat beside a voice channel, where a
  // longer row wraps and the columns stop being columns.
  it('keeps every row within the width a narrow channel can show', () => {
    const wide = summary({
      allies: team([line('bogenpirat', 'Deadlock', 300), line('me', 'Jett', 260, true)]),
    });

    for (const row of rowsOf(fieldsOf(wide)[1])) {
      expect(row.length).toBeLessThanOrEqual(32);
    }
  });

  it('says that it cut a name it had no room for', () => {
    const wide = summary({ allies: team([line('bogenpirat', 'Omen', 300)]) });

    expect(rowsOf(fieldsOf(wide)[1])[0]).toContain('bogenp…');
  });

  it('links the title at the match on tracker.gg, in place of a bare id', () => {
    const data = dataOf(summary());

    expect(data['url']).toBe(trackerMatchUrl('match-abc'));
    expect(data['footer']).toBeUndefined();
  });

  it('leaves the title unlinked rather than building a broken url', () => {
    expect(dataOf(summary({ matchId: '' }))['url']).toBeUndefined();
  });

  it('translates', () => {
    const en = renderMatchSummary(summary(), stringsFor('en')).data;

    expect(en['title']).toBe('Ascent · Win');
  });
});
