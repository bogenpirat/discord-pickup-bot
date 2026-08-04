import { describe, expect, it } from 'vitest';
import { classifyRelease } from '../../../src/domain/steam/classifyRelease.ts';

const TODAY = Temporal.PlainDate.from('2026-08-04');

describe('classifyRelease', () => {
  it('classifies as released when coming_soon is false', () => {
    expect(classifyRelease(false, '24 Feb, 2022', TODAY)).toEqual({ kind: 'released' });
  });

  it('classifies as released when coming_soon is false regardless of date text', () => {
    expect(classifyRelease(false, 'garbage', TODAY)).toEqual({ kind: 'released' });
  });

  it('classifies as scheduled for coming_soon with a future concrete date', () => {
    const result = classifyRelease(true, '14 Aug, 2026', TODAY);
    expect(result.kind).toBe('scheduled');
    expect(result.kind === 'scheduled' && result.date.toString()).toBe('2026-08-14');
  });

  it('classifies as released when coming_soon is still true but the date has passed', () => {
    expect(classifyRelease(true, '1 Jan, 2026', TODAY)).toEqual({ kind: 'released' });
  });

  it('classifies as released when the concrete date is today', () => {
    expect(classifyRelease(true, '4 Aug, 2026', TODAY)).toEqual({ kind: 'released' });
  });

  it.each(['Q2 2026', 'TBA', 'Coming soon', ''])(
    'classifies as pending for unparseable date text %s',
    (text) => {
      expect(classifyRelease(true, text, TODAY)).toEqual({ kind: 'pending' });
    },
  );
});
