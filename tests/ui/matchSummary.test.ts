import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '../../src/domain/valorant/matchSummary.ts';
import { formatDuration, renderMatchSummary } from '../../src/ui/matchSummary.ts';
import { stringsFor } from '../../src/ui/strings.ts';

const de = stringsFor('de');

const line = (label: string, agent: string, acs: number, isTarget = false) => ({
  puuid: label,
  label,
  agent,
  tier: 'Immortal 2',
  kills: 21,
  deaths: 14,
  assists: 6,
  acs,
  adr: 180,
  headshotPercent: 24,
  isTarget,
});

const summary = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
  matchId: 'match-abc',
  map: 'Ascent',
  mode: 'Competitive',
  startedAt: Date.parse('2026-09-01T18:00:00Z'),
  durationMs: 2_400_000,
  outcome: 'win',
  roundsWon: 13,
  roundsLost: 9,
  target: line('ME#EUW', 'Jett', 260, true),
  allies: [line('ALLY#EUW', 'Omen', 300), line('ME#EUW', 'Jett', 260, true)],
  enemies: [line('FOE#EUW', 'Sova', 220)],
  ...overrides,
});

const dataOf = (value: MatchSummary) => renderMatchSummary(value, de).data;

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
    const fields = dataOf(summary())['fields'] as { name: string; value: string }[];

    expect(fields[0]?.name).toContain('Jett');
    expect(fields[0]?.value).toContain('21/14/6');
    expect(fields[0]?.value).toContain('260 ACS');
    expect(fields[0]?.value).toContain('24%');
  });

  it('says so rather than printing a percent when nothing landed', () => {
    const blind = summary({
      target: { ...line('ME#EUW', 'Jett', 0, true), headshotPercent: null },
    });
    const fields = dataOf(blind)['fields'] as { value: string }[];

    expect(fields[0]?.value).toContain(de.notSet);
  });

  it('renders both scoreboards as fixed-width blocks', () => {
    const fields = dataOf(summary())['fields'] as { value: string }[];

    for (const index of [1, 2]) {
      expect(fields[index]?.value.startsWith('```')).toBe(true);
      expect(fields[index]?.value.endsWith('```')).toBe(true);
    }
  });

  it('marks only the target row', () => {
    const fields = dataOf(summary())['fields'] as { value: string }[];
    const rows = (fields[1]?.value ?? '').split('\n').filter((row) => row.startsWith('>'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Jett');
  });

  it('keeps the scoreboard columns aligned whatever the agent name', () => {
    const wide = summary({
      allies: [line('A#EUW', 'Killjoy', 300), line('ME#EUW', 'Iso', 260, true)],
    });
    const fields = dataOf(wide)['fields'] as { value: string }[];
    const rows = (fields[1]?.value ?? '').split('\n').filter((row) => /\d+\/\d+\/\d+/.test(row));

    const kdaColumns = rows.map((row) => row.indexOf('21/14/6'));
    expect(new Set(kdaColumns).size).toBe(1);
  });

  it('footers with the match id, so a report can be traced', () => {
    expect(dataOf(summary())['footer']).toEqual({ text: 'match-abc' });
  });

  it('translates', () => {
    const en = renderMatchSummary(summary(), stringsFor('en')).data;

    expect(en['title']).toBe('Ascent · Win');
  });
});
