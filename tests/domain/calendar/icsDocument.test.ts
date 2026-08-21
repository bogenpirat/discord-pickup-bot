import { describe, expect, it } from 'vitest';
import { type IcsEvent, icsDocument } from '../../../src/domain/calendar/icsDocument.ts';

const STARTS_AT = Date.UTC(2026, 7, 22, 19, 0);
const STAMPED_AT = Date.UTC(2026, 7, 21, 12, 30, 15);

const event = (overrides: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: 'pickup-12@pickup.example.net',
  title: 'Gaming-Session @ Test Guild',
  startsAt: STARTS_AT,
  durationMinutes: 120,
  ...overrides,
});

const render = (overrides: Partial<IcsEvent> = {}): string =>
  icsDocument(event(overrides), STAMPED_AT);

/** Unfolds per RFC 5545 §3.1 so assertions can read whole logical lines. */
const lines = (document: string): string[] =>
  document
    .replace(/\r\n /g, '')
    .split('\r\n')
    .filter((line) => line !== '');

const propertyOf = (document: string, property: string): string | undefined =>
  lines(document)
    .find((line) => line.startsWith(`${property}:`))
    ?.slice(property.length + 1);

describe('structure', () => {
  it('wraps a single event in a calendar', () => {
    expect(lines(render())).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//discord-pickup-bot//Pickup//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:pickup-12@pickup.example.net',
      'DTSTAMP:20260821T123015Z',
      'DTSTART:20260822T190000Z',
      'DTEND:20260822T210000Z',
      'SUMMARY:Gaming-Session @ Test Guild',
      'END:VEVENT',
      'END:VCALENDAR',
    ]);
  });

  it('separates every line with CRLF, including the last', () => {
    const document = render();

    expect(document.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(document.split('\n').every((part) => part === '' || part.endsWith('\r'))).toBe(true);
  });

  it('ends the event two hours after it starts', () => {
    expect(propertyOf(render({ durationMinutes: 90 }), 'DTEND')).toBe('20260822T203000Z');
  });

  it('carries the description and url when given', () => {
    const document = render({
      details: 'Organisiert über Discord: https://discord.com/channels/g/c/m',
      url: 'https://discord.com/channels/g/c/m',
    });

    expect(propertyOf(document, 'DESCRIPTION')).toBe(
      'Organisiert über Discord: https://discord.com/channels/g/c/m',
    );
    expect(propertyOf(document, 'URL')).toBe('https://discord.com/channels/g/c/m');
  });

  it('omits the optional properties entirely when absent', () => {
    const document = render();

    expect(document).not.toContain('DESCRIPTION');
    expect(document).not.toContain('URL:');
  });

  // Both are deliberate: a pickup has no revision counter, and closing it ends
  // the signups rather than the game.
  it('emits neither SEQUENCE nor STATUS', () => {
    expect(render()).not.toContain('SEQUENCE');
    expect(render()).not.toContain('STATUS');
  });
});

describe('text escaping', () => {
  it.each([
    ['a comma', 'Ranked, then customs', 'Ranked\\, then customs'],
    ['a semicolon', 'Ranked; then customs', 'Ranked\\; then customs'],
    ['a backslash', 'C:\\games', 'C:\\\\games'],
  ])('escapes %s', (_label, title, expected) => {
    expect(propertyOf(render({ title }), 'SUMMARY')).toBe(expected);
  });

  it.each([
    ['a line feed', 'one\ntwo'],
    ['a carriage return', 'one\rtwo'],
    ['a CRLF pair', 'one\r\ntwo'],
  ])('folds %s into a literal escape', (_label, details) => {
    expect(propertyOf(render({ details }), 'DESCRIPTION')).toBe('one\\ntwo');
  });

  // Escaping the backslash last would double-escape what the other rules added.
  it('escapes a backslash before the character it precedes', () => {
    expect(propertyOf(render({ title: 'a\\,b' }), 'SUMMARY')).toBe('a\\\\\\,b');
  });

  it('leaves colons alone, since the property name is split off first', () => {
    expect(propertyOf(render({ title: 'CS: Source' }), 'SUMMARY')).toBe('CS: Source');
  });
});

describe('line folding', () => {
  const octets = (line: string): number => Buffer.byteLength(line, 'utf8');

  it('leaves a short line unfolded', () => {
    expect(render()).toContain('\r\nSUMMARY:Gaming-Session @ Test Guild\r\n');
  });

  it.each([
    ['ascii', 'x'.repeat(300)],
    ['umlauts', 'ä'.repeat(300)],
    ['emoji', '🎮'.repeat(300)],
    ['a mix', 'Gaming 🎮 Session ä '.repeat(20)],
  ])('keeps every physical line inside 75 octets with %s', (_label, title) => {
    for (const line of render({ title }).split('\r\n')) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
  });

  it.each([
    ['umlauts', 'ä'.repeat(300)],
    ['emoji', '🎮'.repeat(300)],
  ])('never splits a multi-byte character with %s', (_label, title) => {
    const document = render({ title });

    expect(document).not.toContain('\ufffd');
    expect(propertyOf(document, 'SUMMARY')).toBe(title);
  });

  it('opens each continuation line with a single space', () => {
    const folded = render({ title: 'x'.repeat(300) }).split('\r\n');
    const continuations = folded.filter((line) => line.startsWith(' '));

    expect(continuations.length).toBeGreaterThan(0);
    for (const line of continuations) {
      expect(line.startsWith('  ')).toBe(false);
    }
  });

  it('round-trips a folded value back to exactly what went in', () => {
    const title = `${'Bogenpirat 🎮 '.repeat(30)}end`;
    expect(propertyOf(render({ title }), 'SUMMARY')).toBe(title);
  });

  // A line of exactly the limit must not gain a stray continuation.
  it('does not fold a line sitting exactly on the limit', () => {
    const title = 'x'.repeat(75 - 'SUMMARY:'.length);
    expect(render({ title })).toContain(`\r\nSUMMARY:${title}\r\n`);
  });

  it('folds a line one octet over the limit', () => {
    const title = 'x'.repeat(76 - 'SUMMARY:'.length);
    expect(render({ title })).toContain(`\r\nSUMMARY:${title.slice(0, -1)}\r\n x\r\n`);
  });
});
