import { describe, expect, it } from 'vitest';
import { extractStartTime } from '../../../src/domain/time/extract.ts';

const BERLIN = 'Europe/Berlin';
// A Monday afternoon, 15:00 local.
const now = Temporal.Instant.from('2026-07-27T13:00:00Z');

const extract = (input: string) => extractStartTime(input, BERLIN, now);

const expectTime = (input: string, wall: string): void => {
  const result = extract(input);
  if (result.startsAt === null) {
    throw new Error(`expected a time in "${input}"`);
  }
  expect(result.startsAt.toPlainDateTime().toString({ smallestUnit: 'minute' })).toBe(wall);
};

const expectNoTime = (input: string): void => {
  const result = extract(input);
  expect(result.startsAt).toBeNull();
  expect(result.matched).toBeNull();
};

describe('time only', () => {
  it.each([
    ['20:30', '2026-07-27T20:30'],
    ['halb 9', '2026-07-27T20:30'],
    ['20 uhr', '2026-07-27T20:00'],
    ['viertel vor 9', '2026-07-27T20:45'],
    ['in einer halben stunde', '2026-07-27T15:30'],
    ['morgen 20:30', '2026-07-28T20:30'],
    ['9', '2026-07-27T21:00'],
  ])('extracts %s', (input, wall) => {
    expectTime(input, wall);
  });
});

describe('time embedded in free text', () => {
  it.each([
    ['um 20:30 ranked', '2026-07-27T20:30'],
    ['ranked um 20:30', '2026-07-27T20:30'],
    ['wer hat bock auf valo um halb 9', '2026-07-27T20:30'],
    ['halb 9 unrated bitte', '2026-07-27T20:30'],
    ['heute 22:00 competitive', '2026-07-27T22:00'],
    ['morgen 20:30 ranked grind', '2026-07-28T20:30'],
    ['wir starten in 90 minuten', '2026-07-27T16:30'],
    ['ranked, 20:30, kommt', '2026-07-27T20:30'],
    ['gegen 21 uhr unrated', '2026-07-27T21:00'],
    ['viertel vor 9 nur ranked', '2026-07-27T20:45'],
  ])('reads %s', (input, wall) => {
    expectTime(input, wall);
  });

  it('prefers the longest time expression', () => {
    expectTime('morgen 20:30', '2026-07-28T20:30');
    expect(extract('morgen 20:30').matched).toBe('morgen 20:30');
  });

  it('reports the matched words without touching the text', () => {
    expect(extract('ranked, aber nur kurz um 20:30').matched).toBe('um 20:30');
    expect(extract('grosse runde (BIG WALK) sonntag 20 uhr bitte').matched).toBe('sonntag 20 uhr');
  });
});

describe('weekdays in free text', () => {
  it.each([
    ['sonntag 20:30', '2026-08-02T20:30'],
    ['sonntag 20 uhr', '2026-08-02T20:00'],
    ['sonntagabend 8', '2026-08-02T20:00'],
    ['am sonntag um 20 uhr', '2026-08-02T20:00'],
    ['grosse spazierrunde (BIG WALK) sonntagabend 19 uhr', '2026-08-02T19:00'],
    ['spazierrunde sonntag abend 19 uhr', '2026-08-02T19:00'],
    ['freitag 21:00 ranked', '2026-07-31T21:00'],
  ])('reads %s', (input, wall) => {
    expectTime(input, wall);
  });

  it('keeps a weekday today while the time is still ahead', () => {
    expectTime('montag 20:30 ranked', '2026-07-27T20:30');
  });

  it('moves a weekday whose time has passed to next week', () => {
    expectTime('montag 8:00 ranked', '2026-08-03T08:00');
  });

  it('drops a weekday that comes without a time', () => {
    expectNoTime('grosse spazierrunde (BIG WALK) sonntagabend (oder was anderes idk');
    expectNoTime('sonntag');
    expectNoTime('wer hat bock am sonntag');
    expectNoTime('freitag oder samstag');
  });

  it('never lets a weekday collapse onto today', () => {
    const result = extract('spazierrunde sonntag 19 uhr');
    expect(result.startsAt?.dayOfWeek).toBe(7);
  });
});

describe('free text with no time', () => {
  it.each(['wer hat bock', 'ranked grind', 'brauchen noch leute', 'kurz nach dem abendessen'])(
    'finds nothing in %s',
    (input) => {
      expectNoTime(input);
    },
  );

  it('returns nothing for empty input', () => {
    for (const input of ['', '   ']) {
      expectNoTime(input);
    }
  });

  it('returns nothing for punctuation-only input', () => {
    for (const input of ['...', '?!', '- -']) {
      expectNoTime(input);
    }
  });

  it('skips punctuation-only tokens while scanning', () => {
    expectNoTime('... ranked');
  });

  it('still finds a time next to punctuation-only tokens', () => {
    expect(extract('... ranked ... 20:30').startsAt?.hour).toBe(20);
  });
});

describe('bare numbers are not mistaken for times', () => {
  it.each(['brauchen noch 2 leute', '5 leute da', 'wir sind schon 9', '10 mann'])(
    'does not read a time out of %s',
    (input) => {
      expectNoTime(input);
    },
  );

  it('still accepts a bare number when it is the whole message', () => {
    expectTime('9', '2026-07-27T21:00');
    expectTime('21', '2026-07-27T21:00');
  });

  it('reads a qualified number even when other numbers are present', () => {
    expectTime('brauchen noch 2 leute fuer 20:30', '2026-07-27T20:30');
  });
});
