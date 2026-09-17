import { describe, expect, it } from 'vitest';
import {
  nextCheckFor,
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
  it('resolves to midnight in steam time, not local time', () => {
    const instant = releaseDayInstant(Temporal.PlainDate.from('2026-08-14'));
    const pacific = instant.toZonedDateTimeISO('America/Los_Angeles');

    expect(pacific.toPlainDate().toString()).toBe('2026-08-14');
    expect(pacific.hour).toBe(0);
  });

  it('lands after local midnight, so a berlin day boundary never triggers a check', () => {
    const instant = releaseDayInstant(Temporal.PlainDate.from('2026-08-14'));
    const berlin = instant.toZonedDateTimeISO('Europe/Berlin');

    expect(berlin.hour).toBe(9);
  });
});

describe('nextCheckFor', () => {
  const now = Temporal.Instant.from('2026-09-18T12:00:00Z');

  it('checks back in a week when no release date is known', () => {
    expect(nextCheckFor({ kind: 'pending' }, now).toString()).toBe('2026-09-25T12:00:00Z');
  });

  it('checks back in a week for an already released game', () => {
    expect(nextCheckFor({ kind: 'released' }, now).toString()).toBe('2026-09-25T12:00:00Z');
  });

  it('waits for the exact release instant when it is still ahead', () => {
    const at = Temporal.Instant.from('2026-09-18T19:43:00Z');
    expect(nextCheckFor({ kind: 'scheduled', at }, now).toString()).toBe('2026-09-18T19:43:00Z');
  });

  it('retries hourly once the release instant passes without steam confirming it', () => {
    const at = Temporal.Instant.from('2026-09-18T09:00:00Z');
    expect(nextCheckFor({ kind: 'scheduled', at }, now).toString()).toBe('2026-09-18T13:00:00Z');
  });

  it('backs off to weekly once a release is more than a week overdue', () => {
    const at = Temporal.Instant.from('2026-09-01T09:00:00Z');
    expect(nextCheckFor({ kind: 'scheduled', at }, now).toString()).toBe('2026-09-25T12:00:00Z');
  });
});
