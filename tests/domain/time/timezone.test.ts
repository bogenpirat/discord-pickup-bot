import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  searchTimeZones,
} from '../../../src/domain/time/timezone.ts';

describe('isValidTimeZone', () => {
  it.each(['Europe/Berlin', 'UTC', 'America/New_York', 'Asia/Tokyo'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['', '   ', 'Europe/Atlantis', 'not a zone', 'Europe//Berlin'])('rejects %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });

  it('accepts the default time zone', () => {
    expect(isValidTimeZone(DEFAULT_TIME_ZONE)).toBe(true);
  });
});

describe('searchTimeZones', () => {
  it('suggests european zones for an empty query', () => {
    const zones = searchTimeZones('', 5);
    expect(zones).toHaveLength(5);
    for (const zone of zones) {
      expect(zone.startsWith('Europe/')).toBe(true);
    }
  });

  it('matches case insensitively on any part of the name', () => {
    expect(searchTimeZones('berlin', 25)).toContain('Europe/Berlin');
    expect(searchTimeZones('BERLIN', 25)).toContain('Europe/Berlin');
    expect(searchTimeZones('europe/ber', 25)).toContain('Europe/Berlin');
  });

  it('treats spaces as underscores', () => {
    expect(searchTimeZones('new york', 25)).toContain('America/New_York');
  });

  it('honours the limit', () => {
    expect(searchTimeZones('a', 3)).toHaveLength(3);
  });

  it('returns nothing for a query that matches no zone', () => {
    expect(searchTimeZones('atlantis', 25)).toEqual([]);
  });
});
