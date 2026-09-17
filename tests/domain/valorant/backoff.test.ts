import { describe, expect, it } from 'vitest';
import {
  isRetryable,
  parseDelaySeconds,
  retryDelayMs,
} from '../../../src/domain/valorant/backoff.ts';

/** Removes the jitter so the base delay is assertable exactly. */
const noJitter = () => 0.5;

describe('isRetryable', () => {
  it.each([429, 500, 502, 503])('retries %i', (status) => {
    expect(isRetryable(status)).toBe(true);
  });

  it.each([200, 400, 401, 403, 404, 422, 499])('does not retry %i', (status) => {
    expect(isRetryable(status)).toBe(false);
  });
});

describe('parseDelaySeconds', () => {
  it('reads a numeric header', () => {
    expect(parseDelaySeconds('12')).toBe(12);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDelaySeconds(' 7 ')).toBe(7);
  });

  it('accepts zero', () => {
    expect(parseDelaySeconds('0')).toBe(0);
  });

  it.each([null, 'soon', '-1', ''])('returns null for %j', (header) => {
    expect(parseDelaySeconds(header)).toBeNull();
  });
});

describe('retryDelayMs', () => {
  it('grows exponentially when the server says nothing', () => {
    const delay = (attempt: number) =>
      retryDelayMs({ attempt, retryAfterSeconds: null, resetSeconds: null, random: noJitter });

    expect(delay(0)).toBe(1_000);
    expect(delay(1)).toBe(2_000);
    expect(delay(2)).toBe(4_000);
  });

  it('prefers retry-after over the reset window', () => {
    expect(
      retryDelayMs({ attempt: 5, retryAfterSeconds: 3, resetSeconds: 20, random: noJitter }),
    ).toBe(3_000);
  });

  it('falls back to the reset window when retry-after is absent', () => {
    expect(
      retryDelayMs({ attempt: 5, retryAfterSeconds: null, resetSeconds: 9, random: noJitter }),
    ).toBe(9_000);
  });

  it('rounds a fractional retry-after up to whole milliseconds', () => {
    expect(
      retryDelayMs({ attempt: 0, retryAfterSeconds: 1.2345, resetSeconds: null, random: noJitter }),
    ).toBe(1_235);
  });

  it('caps the delay at thirty seconds', () => {
    expect(
      retryDelayMs({ attempt: 20, retryAfterSeconds: null, resetSeconds: null, random: () => 1 }),
    ).toBe(30_000);
  });

  it('never returns a negative delay', () => {
    expect(
      retryDelayMs({ attempt: 0, retryAfterSeconds: 0, resetSeconds: null, random: () => 0 }),
    ).toBe(0);
  });

  it('spreads the delay by up to twenty percent either way', () => {
    const base = { attempt: 1, retryAfterSeconds: null, resetSeconds: null };

    expect(retryDelayMs({ ...base, random: () => 0 })).toBe(1_600);
    expect(retryDelayMs({ ...base, random: () => 1 })).toBe(2_400);
  });

  it('uses Math.random when no generator is injected', () => {
    const delay = retryDelayMs({ attempt: 0, retryAfterSeconds: null, resetSeconds: null });
    expect(delay).toBeGreaterThanOrEqual(800);
    expect(delay).toBeLessThanOrEqual(1_200);
  });
});
