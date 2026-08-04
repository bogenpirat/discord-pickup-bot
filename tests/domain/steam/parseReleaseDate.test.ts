import { describe, expect, it } from 'vitest';
import { parseSteamReleaseDate } from '../../../src/domain/steam/parseReleaseDate.ts';

describe('parseSteamReleaseDate', () => {
  it('parses a concrete date with a comma', () => {
    const date = parseSteamReleaseDate('24 Feb, 2022');
    expect(date?.toString()).toBe('2022-02-24');
  });

  it('parses a concrete date without a comma', () => {
    const date = parseSteamReleaseDate('9 Dec 2020');
    expect(date?.toString()).toBe('2020-12-09');
  });

  it('parses a single-digit day', () => {
    const date = parseSteamReleaseDate('1 Jan, 2027');
    expect(date?.toString()).toBe('2027-01-01');
  });

  it('trims surrounding whitespace', () => {
    const date = parseSteamReleaseDate('  24 Feb, 2022  ');
    expect(date?.toString()).toBe('2022-02-24');
  });

  it.each(['Q2 2026', 'TBA', 'Coming soon', '', '2026', 'Fall 2026'])(
    'returns null for non-concrete text %s',
    (text) => {
      expect(parseSteamReleaseDate(text)).toBeNull();
    },
  );

  it('returns null for an unknown month abbreviation', () => {
    expect(parseSteamReleaseDate('24 Xyz, 2022')).toBeNull();
  });

  it('returns null for an invalid calendar date', () => {
    expect(parseSteamReleaseDate('31 Feb, 2022')).toBeNull();
  });
});
