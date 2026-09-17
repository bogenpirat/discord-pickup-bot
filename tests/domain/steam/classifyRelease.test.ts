import { describe, expect, it } from 'vitest';
import { classifyRelease } from '../../../src/domain/steam/classifyRelease.ts';

const EXACT = Temporal.Instant.from('2026-09-18T19:43:00Z');

describe('classifyRelease', () => {
  it('classifies as released when coming_soon is false', () => {
    expect(classifyRelease(false, '24 Feb, 2022', null)).toEqual({ kind: 'released' });
  });

  it('classifies as released when coming_soon is false regardless of date text', () => {
    expect(classifyRelease(false, 'garbage', null)).toEqual({ kind: 'released' });
  });

  it('prefers the exact release instant over the day-granular date text', () => {
    expect(classifyRelease(true, '18 Sep, 2026', EXACT)).toEqual({ kind: 'scheduled', at: EXACT });
  });

  it('falls back to the start of the steam release day when no exact instant is known', () => {
    const result = classifyRelease(true, '14 Aug, 2026', null);
    expect(result.kind).toBe('scheduled');
    // Midnight Pacific, not Berlin: Steam renders the date in its own timezone.
    expect(result.kind === 'scheduled' && result.at.toString()).toBe('2026-08-14T07:00:00Z');
  });

  it('stays scheduled when coming_soon is still true but the date has passed', () => {
    expect(classifyRelease(true, '1 Jan, 2026', null)).toEqual({
      kind: 'scheduled',
      at: Temporal.Instant.from('2026-01-01T08:00:00Z'),
    });
  });

  it('stays scheduled when coming_soon is still true and the exact instant has passed', () => {
    expect(classifyRelease(true, '18 Sep, 2026', EXACT)).toEqual({ kind: 'scheduled', at: EXACT });
  });

  it.each(['Q2 2026', 'TBA', 'Coming soon', ''])(
    'classifies as pending for unparseable date text %s',
    (text) => {
      expect(classifyRelease(true, text, null)).toEqual({ kind: 'pending' });
    },
  );
});
