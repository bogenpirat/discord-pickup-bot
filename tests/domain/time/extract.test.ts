import { describe, expect, it } from 'vitest';
import { extractStartTime } from '../../../src/domain/time/extract.ts';

const BERLIN = 'Europe/Berlin';
const now = Temporal.Instant.from('2026-07-27T13:00:00Z');

const extract = (input: string) => extractStartTime(input, BERLIN, now);

const expectTime = (input: string, wall: string, note: string | null): void => {
  const result = extract(input);
  if (result.startsAt === null) {
    throw new Error(`expected a time in "${input}"`);
  }
  expect(result.startsAt.toPlainDateTime().toString({ smallestUnit: 'minute' })).toBe(wall);
  expect(result.note).toBe(note);
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
  ])('extracts %s with no leftover note', (input, wall) => {
    expectTime(input, wall, null);
  });
});

describe('time embedded in free text', () => {
  it.each([
    ['um 20:30 ranked', '2026-07-27T20:30', 'ranked'],
    ['ranked um 20:30', '2026-07-27T20:30', 'ranked'],
    ['wer hat bock auf valo um halb 9', '2026-07-27T20:30', 'wer hat bock auf valo'],
    ['halb 9 unrated bitte', '2026-07-27T20:30', 'unrated bitte'],
    ['heute 22:00 competitive', '2026-07-27T22:00', 'competitive'],
    ['morgen 20:30 ranked grind', '2026-07-28T20:30', 'ranked grind'],
    ['wir starten in 90 minuten', '2026-07-27T16:30', 'wir starten'],
    ['ranked, 20:30, kommt', '2026-07-27T20:30', 'ranked, kommt'],
    ['gegen 21 uhr unrated', '2026-07-27T21:00', 'unrated'],
    ['viertel vor 9 nur ranked', '2026-07-27T20:45', 'nur ranked'],
  ])('reads %s', (input, wall, note) => {
    expectTime(input, wall, note);
  });

  it('drops a filler preposition from the note', () => {
    expect(extract('um 20:30').note).toBeNull();
    expect(extract('ab 20:30 ranked').note).toBe('ranked');
  });

  it('prefers the longest time expression', () => {
    expectTime('morgen 20:30', '2026-07-28T20:30', null);
    expect(extract('morgen 20:30').matched).toBe('morgen 20:30');
  });
});

describe('free text with no time', () => {
  it.each(['wer hat bock', 'ranked grind', 'brauchen noch leute', 'kurz nach dem abendessen'])(
    'keeps %s entirely as the note',
    (input) => {
      const result = extract(input);
      expect(result.startsAt).toBeNull();
      expect(result.matched).toBeNull();
      expect(result.note).toBe(input);
    },
  );

  it('returns nothing for empty input', () => {
    for (const input of ['', '   ']) {
      const result = extract(input);
      expect(result.startsAt).toBeNull();
      expect(result.note).toBeNull();
    }
  });

  it('returns nothing for punctuation-only input', () => {
    for (const input of ['...', '?!', '- -']) {
      const result = extract(input);
      expect(result.startsAt).toBeNull();
      expect(result.note).toBeNull();
    }
  });

  it('skips punctuation-only tokens while scanning', () => {
    const result = extract('... ranked');
    expect(result.startsAt).toBeNull();
    expect(result.note).toBe('ranked');
  });

  it('still finds a time next to punctuation-only tokens', () => {
    const result = extract('... ranked ... 20:30');
    expect(result.startsAt?.hour).toBe(20);
    expect(result.note).toBe('ranked');
  });
});

describe('bare numbers are not mistaken for times', () => {
  it.each(['brauchen noch 2 leute', '5 leute da', 'wir sind schon 9', '10 mann'])(
    'does not read a time out of %s',
    (input) => {
      const result = extract(input);
      expect(result.startsAt).toBeNull();
      expect(result.note).toBe(input);
    },
  );

  it('still accepts a bare number when it is the whole message', () => {
    expectTime('9', '2026-07-27T21:00', null);
    expectTime('21', '2026-07-27T21:00', null);
  });

  it('reads a qualified number even when other numbers are present', () => {
    expectTime(
      'brauchen noch 2 leute fuer 20:30',
      '2026-07-27T20:30',
      'brauchen noch 2 leute fuer',
    );
  });
});

describe('note cleanup', () => {
  it('collapses whitespace left behind', () => {
    expect(extract('ranked    um   20:30    bitte').note).toBe('ranked bitte');
  });

  it('trims dangling punctuation', () => {
    expect(extract('20:30, ranked!').note).toBe('ranked');
    expect(extract('ranked - 20:30').note).toBe('ranked');
  });

  it('keeps punctuation inside the note', () => {
    expect(extract('ranked, aber nur kurz um 20:30').note).toBe('ranked, aber nur kurz');
  });
});
