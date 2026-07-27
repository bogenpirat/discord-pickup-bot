import { parseStartTime } from './parseStartTime.ts';

const MAX_WINDOW = 4;
const EDGE_PUNCTUATION = /^[\s.,;:!?()[\]"'„“”-]+|[\s.,;:!?()[\]"'„“”-]+$/g;
const BARE_NUMBER = /^\d{1,2}$/;
const FILLERS = new Set(['um', 'ab', 'gegen', 'at', 'around', '@']);

export interface ExtractedTime {
  readonly startsAt: Temporal.ZonedDateTime | null;
  readonly matched: string | null;
  readonly note: string | null;
}

const trimEdges = (value: string): string => value.replace(EDGE_PUNCTUATION, '');

const toNote = (tokens: readonly string[]): string | null => {
  const note = trimEdges(tokens.join(' ').replace(/\s+/g, ' '));
  return note === '' ? null : note;
};

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
    return { startsAt: null, matched: null, note: null };
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

      const before = tokens.slice(0, start);
      const previous = before.at(-1);
      const withoutFiller =
        previous !== undefined && FILLERS.has(trimEdges(previous).toLowerCase())
          ? before.slice(0, -1)
          : before;

      return {
        startsAt: parsed.value,
        matched: candidate,
        note: toNote([...withoutFiller, ...tokens.slice(start + size)]),
      };
    }
  }

  return { startsAt: null, matched: null, note: toNote(tokens) };
};
