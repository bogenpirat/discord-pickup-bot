import { describe, expect, it } from 'vitest';
import {
  averageTierName,
  NO_TIER_SHORT,
  tierName,
  tierShortName,
} from '../../../src/domain/valorant/tier.ts';

describe('tierName', () => {
  it.each([
    [3, 'Iron 1'],
    [5, 'Iron 3'],
    [11, 'Silver 3'],
    [12, 'Gold 1'],
    [24, 'Immortal 1'],
    [26, 'Immortal 3'],
    [27, 'Radiant'],
  ])('names tier %i as %s', (tierId, expected) => {
    expect(tierName(tierId)).toBe(expected);
  });

  it.each([0, 1, 2, -1])('has no name for the unranked tier %i', (tierId) => {
    expect(tierName(tierId)).toBeNull();
  });

  it('would rather not name a rank above the ladder it knows', () => {
    expect(tierName(28)).toBeNull();
  });

  it('has no name for a tier that is not a number at all', () => {
    expect(tierName(Number.NaN)).toBeNull();
  });
});

describe('tierShortName', () => {
  it.each([
    [3, 'I1'],
    [7, 'B2'],
    [15, 'P1'],
    [21, 'A1'],
    [25, 'Im2'],
    [27, 'Rad'],
  ])('shortens tier %i to %s', (tierId, expected) => {
    expect(tierShortName(tierId)).toBe(expected);
  });

  it('marks a player the api gave no rank for', () => {
    expect(tierShortName(null)).toBe(NO_TIER_SHORT);
    expect(tierShortName(0)).toBe(NO_TIER_SHORT);
  });

  it('stays inside its column, whatever the rank', () => {
    for (let tierId = 3; tierId <= 27; tierId += 1) {
      expect(tierShortName(tierId).length).toBeLessThanOrEqual(3);
    }
  });
});

describe('averageTierName', () => {
  it('names the mean of a side', () => {
    expect(averageTierName([12, 14])).toBe('Gold 2');
  });

  it('rounds to the nearest tier rather than truncating', () => {
    expect(averageTierName([21, 22])).toBe('Ascendant 2');
  });

  it('crosses group boundaries, since the ladder is one scale', () => {
    // Gold 3 and Platinum 2 sit either side of the boundary.
    expect(averageTierName([14, 16])).toBe('Platinum 1');
  });

  it('ignores the players it has no rank for', () => {
    expect(averageTierName([12, null, 0])).toBe('Gold 1');
  });

  it('has no answer when nobody on the side is ranked', () => {
    expect(averageTierName([null, null])).toBeNull();
    expect(averageTierName([])).toBeNull();
  });
});
