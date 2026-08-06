import { describe, expect, it } from 'vitest';
import { parseStartTime } from '../../../src/domain/time/parseStartTime.ts';
import type { TimeParseErrorCode } from '../../../src/domain/time/types.ts';

const BERLIN = 'Europe/Berlin';

const at = (iso: string): Temporal.Instant => Temporal.Instant.from(iso);

const summerAfternoon = at('2026-07-27T13:00:00Z');

const parse = (input: string, now: Temporal.Instant = summerAfternoon, zone = BERLIN) =>
  parseStartTime(input, zone, now);

const expectWall = (
  input: string,
  expected: string,
  now: Temporal.Instant = summerAfternoon,
  zone = BERLIN,
): void => {
  const result = parse(input, now, zone);
  if (!result.ok) {
    throw new Error(`expected "${input}" to parse, got ${result.error.code}`);
  }
  expect(result.value.toPlainDateTime().toString({ smallestUnit: 'minute' })).toBe(expected);
};

const expectError = (input: string, code: TimeParseErrorCode, now = summerAfternoon): void => {
  const result = parse(input, now);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
};

describe('german absolute forms', () => {
  it.each([
    ['20:30', '2026-07-27T20:30'],
    ['20.30', '2026-07-27T20:30'],
    ['20,30', '2026-07-27T20:30'],
    ['20 uhr', '2026-07-27T20:00'],
    ['20 Uhr', '2026-07-27T20:00'],
    ['20:30 Uhr', '2026-07-27T20:30'],
    ['9:05', '2026-07-28T09:05'],
    ['0:15', '2026-07-28T00:15'],
    ['00:30', '2026-07-28T00:30'],
    ['23:59', '2026-07-27T23:59'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });
});

describe('english absolute forms', () => {
  it.each([
    ['8pm', '2026-07-27T20:00'],
    ['8 pm', '2026-07-27T20:00'],
    ['8:30 pm', '2026-07-27T20:30'],
    ['8:30pm', '2026-07-27T20:30'],
    ['8am', '2026-07-28T08:00'],
    ['12am', '2026-07-28T00:00'],
    ['12pm', '2026-07-28T12:00'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });
});

describe('colloquial forms', () => {
  it.each([
    ['halb 9', '2026-07-27T20:30'],
    ['halb9', '2026-07-27T20:30'],
    ['HALB 9', '2026-07-27T20:30'],
    ['halb 1', '2026-07-28T12:30'],
    ['halb 21', '2026-07-27T20:30'],
    ['halb 13', '2026-07-28T12:30'],
    ['viertel nach 8', '2026-07-27T20:15'],
    ['Viertel Nach 8', '2026-07-27T20:15'],
    ['viertel vor 9', '2026-07-27T20:45'],
    ['Viertel Vor 9', '2026-07-27T20:45'],
    ['viertel vor 12', '2026-07-27T23:45'],
    ['viertel 9', '2026-07-27T20:15'],
    ['dreiviertel 9', '2026-07-27T20:45'],
    ['half past 8', '2026-07-27T20:30'],
    ['quarter past 8', '2026-07-27T20:15'],
    ['quarter to 9', '2026-07-27T20:45'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });
});

describe('relative forms', () => {
  it.each([
    ['in 90m', '2026-07-27T16:30'],
    ['in 90 min', '2026-07-27T16:30'],
    ['in 90 minuten', '2026-07-27T16:30'],
    ['in 2h', '2026-07-27T17:00'],
    ['in 2 std', '2026-07-27T17:00'],
    ['in 2 stunden', '2026-07-27T17:00'],
    ['in 1,5 stunden', '2026-07-27T16:30'],
    ['in 1.5 stunden', '2026-07-27T16:30'],
    ['in 1h30m', '2026-07-27T16:30'],
    ['in einer stunde', '2026-07-27T16:00'],
    ['in einer halben stunde', '2026-07-27T15:30'],
    ['in einer viertelstunde', '2026-07-27T15:15'],
    ['in 20 minuten', '2026-07-27T15:20'],
    ['in 2 hours', '2026-07-27T17:00'],
    ['in half an hour', '2026-07-27T15:30'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });

  it.each(['gleich', 'jetzt', 'sofort', 'demnächst', 'now'])('treats %s as now', (input) => {
    expectWall(input, '2026-07-27T15:00');
  });
});

describe('day prefixes', () => {
  it.each([
    ['morgen 20:30', '2026-07-28T20:30'],
    ['morgen halb 9', '2026-07-28T20:30'],
    ['übermorgen 20 uhr', '2026-07-29T20:00'],
    ['uebermorgen 20 uhr', '2026-07-29T20:00'],
    ['heute 22:00', '2026-07-27T22:00'],
    ['tomorrow 8pm', '2026-07-28T20:00'],
    ['today 22:00', '2026-07-27T22:00'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });

  it('reads morgen as tomorrow, never as morning', () => {
    expectWall('morgen 8', '2026-07-28T20:00');
  });

  it('rejects a relative expression behind an explicit day prefix', () => {
    expectError('morgen in 2h', 'unrecognized');
  });

  it('reads a daypart behind an explicit day prefix', () => {
    expectWall('morgen abend 20:30', '2026-07-28T20:30');
  });
});

describe('weekdays', () => {
  // summerAfternoon is Monday 2026-07-27, 15:00 in Berlin.
  it.each([
    ['montag 20:30', '2026-07-27T20:30'],
    ['dienstag 20:30', '2026-07-28T20:30'],
    ['mittwoch 20:30', '2026-07-29T20:30'],
    ['donnerstag 20:30', '2026-07-30T20:30'],
    ['freitag 20:30', '2026-07-31T20:30'],
    ['samstag 20:30', '2026-08-01T20:30'],
    ['sonnabend 20:30', '2026-08-01T20:30'],
    ['sonntag 20:30', '2026-08-02T20:30'],
    ['sunday 8:30 pm', '2026-08-02T20:30'],
    ['Sonntag 20 Uhr', '2026-08-02T20:00'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });

  it.each([
    ['sonntagabend 20:30', '2026-08-02T20:30'],
    ['sonntag abend 20:30', '2026-08-02T20:30'],
    ['sonntagmorgen 9:30', '2026-08-02T09:30'],
    ['sonntags 20:30', '2026-08-02T20:30'],
    ['sunday evening 8:30 pm', '2026-08-02T20:30'],
  ])('swallows the daypart in %s', (input, expected) => {
    expectWall(input, expected);
  });

  it.each([
    ['am sonntag 20:30', '2026-08-02T20:30'],
    ['sonntag um 20:30', '2026-08-02T20:30'],
    ['am sonntag um 20:30', '2026-08-02T20:30'],
    ['on sunday at 8:30 pm', '2026-08-02T20:30'],
    ['sonntag gegen 20:30', '2026-08-02T20:30'],
  ])('ignores filler words in %s', (input, expected) => {
    expectWall(input, expected);
  });

  it('keeps today when the named day is today and the time is still ahead', () => {
    expectWall('montag 20:30', '2026-07-27T20:30');
  });

  it('jumps a full week when the named day is today but the time has passed', () => {
    expectWall('montag 8:00', '2026-08-03T08:00');
    expectWall('montag 20:30', '2026-08-03T20:30', at('2026-07-27T19:30:00Z'));
  });

  it('applies the evening preference to a bare hour', () => {
    expectWall('sonntag 8', '2026-08-02T20:00');
    expectWall('sonntagabend 8', '2026-08-02T20:00');
  });

  it.each(['sonntag', 'sonntagabend', 'am sonntag', 'sonntag abend', 'sunday evening'])(
    'rejects %s without a time',
    (input) => {
      expectError(input, 'unrecognized');
    },
  );

  it('rejects a relative expression behind a weekday', () => {
    expectError('sonntag in 2h', 'unrecognized');
  });

  it('keeps the wall clock across a dst boundary', () => {
    const result = parse('sonntag 20:30', at('2027-03-25T12:00:00Z'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toPlainDateTime().toString({ smallestUnit: 'minute' })).toBe(
        '2027-03-28T20:30',
      );
      expect(result.value.offset).toBe('+02:00');
    }
  });
});

describe('filler words', () => {
  it.each([
    ['um 20:30', '2026-07-27T20:30'],
    ['ab 20:30', '2026-07-27T20:30'],
    ['gegen 21 uhr', '2026-07-27T21:00'],
    ['at 8:30 pm', '2026-07-27T20:30'],
    ['around 8:30 pm', '2026-07-27T20:30'],
    ['@ 20:30', '2026-07-27T20:30'],
    ['@20:30', '2026-07-27T20:30'],
    ['ab jetzt', '2026-07-27T15:00'],
  ])('parses %s', (input, expected) => {
    expectWall(input, expected);
  });

  it('leaves a meridiem alone', () => {
    expectWall('8 am', '2026-07-28T08:00');
  });
});

describe('evening preference', () => {
  it.each([
    ['8', '2026-07-27T20:00'],
    ['11', '2026-07-27T23:00'],
    ['12', '2026-07-28T12:00'],
    ['13', '2026-07-28T13:00'],
    ['1', '2026-07-28T13:00'],
  ])('resolves bare %s', (input, expected) => {
    expectWall(input, expected);
  });

  it('resolves a bare small hour to the evening while it is still ahead', () => {
    expectWall('8', '2026-07-27T20:00', at('2026-07-27T10:00:00Z'));
    expectWall('1', '2026-07-27T13:00', at('2026-07-27T10:00:00Z'));
  });

  it.each([
    ['8:00', '2026-07-28T08:00'],
    ['08:00', '2026-07-28T08:00'],
    ['8 am', '2026-07-28T08:00'],
  ])('keeps %s literal when minutes or meridiem are explicit', (input, expected) => {
    expectWall(input, expected);
  });
});

describe('roll forward', () => {
  it('keeps a future time today', () => {
    expectWall('20:30', '2026-07-27T20:30', at('2026-07-27T17:00:00Z'));
  });

  it('moves a past time to tomorrow', () => {
    expectWall('20:30', '2026-07-28T20:30', at('2026-07-27T19:30:00Z'));
  });

  it('moves the exact current minute to tomorrow', () => {
    expectWall('20:30', '2026-07-28T20:30', at('2026-07-27T18:30:00Z'));
  });

  it('refuses a past time pinned to today rather than jumping a day', () => {
    expectError('heute 8:00', 'pastTime');
  });
});

describe('daylight saving time', () => {
  const springForward = at('2027-03-27T23:30:00Z');
  const autumnBack = at('2027-10-30T23:30:00Z');

  it('adds two real hours across the skipped hour, so the wall clock jumps three', () => {
    const result = parse('in 2 stunden', springForward);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toPlainDateTime().toString({ smallestUnit: 'minute' })).toBe(
        '2027-03-28T03:30',
      );
      expect(result.value.epochMilliseconds - springForward.epochMilliseconds).toBe(
        2 * 60 * 60_000,
      );
    }
  });

  it('resolves a wall time inside the spring-forward gap without throwing', () => {
    const result = parse('2:30', springForward);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hour).toBe(3);
      expect(result.value.offset).toBe('+02:00');
    }
  });

  it('picks the earlier offset for a repeated autumn wall time', () => {
    const result = parse('2:30', autumnBack);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.offset).toBe('+02:00');
    }
  });

  it('keeps the wall clock when tomorrow is on the far side of a dst boundary', () => {
    const result = parse('morgen 20:30', at('2027-03-27T12:00:00Z'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toPlainDateTime().toString({ smallestUnit: 'minute' })).toBe(
        '2027-03-28T20:30',
      );
      expect(result.value.offset).toBe('+02:00');
    }
  });
});

describe('timezone independence', () => {
  const zones = [BERLIN, 'UTC', 'America/New_York'];

  it('yields the same wall clock and distinct instants across zones', () => {
    const epochs = zones.map((zone) => {
      const result = parseStartTime('20:30', zone, summerAfternoon);
      if (!result.ok) {
        throw new Error(`expected a parse in ${zone}`);
      }
      expect(result.value.hour).toBe(20);
      expect(result.value.minute).toBe(30);
      return result.value.epochMilliseconds;
    });

    expect(new Set(epochs).size).toBe(zones.length);
  });
});

describe('rejections', () => {
  it.each<[string, TimeParseErrorCode]>([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'unrecognized'],
    ['2o:30', 'unrecognized'],
    ['-5', 'unrecognized'],
    ['in -2h', 'unrecognized'],
    ['20:30:45', 'unrecognized'],
    ['halb', 'unrecognized'],
    ['viertel vor', 'unrecognized'],
    ['morgen', 'unrecognized'],
    ['🎮🎮', 'unrecognized'],
    ['25:00', 'invalidHour'],
    ['24:00', 'invalidHour'],
    ['25', 'invalidHour'],
    ['99', 'invalidHour'],
    ['13pm', 'invalidHour'],
    ['0am', 'invalidHour'],
    ['viertel nach 25', 'invalidHour'],
    ['halb 0', 'invalidHour'],
    ['viertel nach 24', 'invalidHour'],
    ['20:60', 'invalidMinute'],
    ['8:99 pm', 'invalidMinute'],
    ['in 0m', 'nonPositiveDuration'],
    ['in 0h', 'nonPositiveDuration'],
    ['in 500 stunden', 'durationTooLong'],
    ['in 2x', 'unrecognized'],
    ['in abc 2h', 'unrecognized'],
    ['in 2h extra', 'unrecognized'],
    ['in stunden', 'unrecognized'],
    ['in ', 'unrecognized'],
  ])('rejects %s as %s', (input, code) => {
    expectError(input, code);
  });

  it('rejects a very long string', () => {
    expectError('a'.repeat(500), 'unrecognized');
  });
});

describe('round trip', () => {
  it('parses every formatted wall clock of the day', () => {
    const now = at('2026-07-27T00:30:00Z');
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const formatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const result = parseStartTime(formatted, BERLIN, now);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hour).toBe(hour);
        expect(result.value.minute).toBe(minute);
      }
    }
  });
});
