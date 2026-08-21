import { type CalendarEvent, endOf } from './googleCalendarLink.ts';
import { utcStamp } from './utcStamp.ts';

const PRODUCT_ID = '-//discord-pickup-bot//Pickup//EN';

/** RFC 5545 §3.1: content lines are folded so no line exceeds 75 octets. */
const FOLD_LIMIT = 75;

export interface IcsEvent extends CalendarEvent {
  /** Stable and globally unique, so a re-download updates rather than duplicates. */
  readonly uid: string;
  readonly url?: string;
}

/**
 * RFC 5545 §3.3.11: backslash, semicolon and comma are structural in TEXT values
 * and newlines are written as a literal `\n`. Colons are not escaped — the
 * property name is split off before the value is ever read.
 */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/**
 * Folds one content line to 75 **octets** — the limit is bytes, not characters,
 * so a name full of emoji folds sooner than its length suggests. Continuation
 * lines open with a space, which counts against their own budget.
 *
 * Measuring one code point at a time rather than slicing the encoded buffer is
 * what keeps a multi-byte character from being cut in half at the split.
 */
const foldLine = (line: string): string => {
  if (Buffer.byteLength(line, 'utf8') <= FOLD_LIMIT) {
    return line;
  }

  const pieces: string[] = [];
  let current = '';
  let used = 0;
  let budget = FOLD_LIMIT;

  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');

    if (used + size > budget) {
      pieces.push(current);
      current = '';
      used = 0;
      budget = FOLD_LIMIT - 1;
    }

    current += character;
    used += size;
  }

  pieces.push(current);

  return pieces.join('\r\n ');
};

/**
 * Renders a single-event iCalendar document (RFC 5545). Pure: callers hand in
 * finished text and a stamp, and get the file body back.
 *
 * No `SEQUENCE` is emitted because a pickup carries no revision counter, and no
 * `STATUS` because closing a pickup ends the signups rather than the game.
 */
export const icsDocument = (event: IcsEvent, stampedAt: number): string => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${utcStamp(stampedAt)}`,
    `DTSTART:${utcStamp(event.startsAt)}`,
    `DTEND:${utcStamp(endOf(event))}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.details !== undefined) {
    lines.push(`DESCRIPTION:${escapeText(event.details)}`);
  }

  if (event.url !== undefined) {
    // URI values are not TEXT, so they are folded but never escaped.
    lines.push(`URL:${event.url}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
};
