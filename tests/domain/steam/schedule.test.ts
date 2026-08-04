import { describe, expect, it } from 'vitest';
import {
  nextRetryCheck,
  nextWeeklyCheck,
  releaseDayInstant,
} from '../../../src/domain/steam/schedule.ts';

describe('nextWeeklyCheck', () => {
  it('adds 7 days to now', () => {
    const now = Temporal.Instant.from('2026-08-04T12:00:00Z');
    expect(nextWeeklyCheck(now).toString()).toBe('2026-08-11T12:00:00Z');
  });
});

describe('nextRetryCheck', () => {
  it('adds 1 hour to now', () => {
    const now = Temporal.Instant.from('2026-08-04T12:00:00Z');
    expect(nextRetryCheck(now).toString()).toBe('2026-08-04T13:00:00Z');
  });
});

describe('releaseDayInstant', () => {
  it('resolves to midnight Berlin time on the given date', () => {
    const date = Temporal.PlainDate.from('2026-08-14');
    const instant = releaseDayInstant(date);
    expect(instant.toZonedDateTimeISO('Europe/Berlin').toPlainDate().toString()).toBe('2026-08-14');
    expect(instant.toZonedDateTimeISO('Europe/Berlin').hour).toBe(0);
  });
});
