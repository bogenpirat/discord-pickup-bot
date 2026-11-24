import { parseStartTime } from './parseStartTime.ts';

const MAX_WINDOW = 4;
const EDGE_PUNCTUATION = /^[\s.,;:!?()[\]"'„“”-]+|[\s.,;:!?()[\]"'„“”-]+$/g;
const BARE_NUMBER = /^\d{1,2}$/;

export interface ExtractedTime {
  readonly startsAt: Temporal.ZonedDateTime | null;
  readonly matched: string | null;
  /**
   * The text with the words that named the time taken out, for a caller that
   * shows the time on its own. The whole text when no time was found.
   */
  readonly remainder: string;
}

const trimEdges = (value: string): string => value.replace(EDGE_PUNCTUATION, '');

/**
 * Finds a start time inside free text. The text itself is left alone — most
 * callers keep showing it in full — so the matched words are reported, and
 * what remains without them is offered alongside.
 */
export const extractStartTime = (
  input: string,
  timeZone: string,
  now: Temporal.Instant,
): ExtractedTime => {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '');

  if (tokens.length === 0) {
    return { startsAt: null, matched: null, remainder: '' };
  }

  for (let size = Math.min(MAX_WINDOW, tokens.length); size >= 1; size -= 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const window = tokens.slice(start, start + size);
      const candidate = trimEdges(window.map(trimEdges).join(' '));

      if (candidate === '') {
        continue;
      }
      if (size === 1 && tokens.length > 1 && BARE_NUMBER.test(candidate)) {
        continue;
      }

      const parsed = parseStartTime(candidate, timeZone, now);
      if (!parsed.ok) {
        continue;
      }

      const remainder = [...tokens.slice(0, start), ...tokens.slice(start + size)].join(' ');
      return { startsAt: parsed.value, matched: candidate, remainder };
    }
  }

  return { startsAt: null, matched: null, remainder: tokens.join(' ') };
};
