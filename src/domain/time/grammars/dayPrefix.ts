import type { DayAnchor } from '../types.ts';

/**
 * Dayparts are swallowed, not interpreted: "sonntagabend 8" leans on the evening
 * preference for bare hours, and a daypart on its own never anchors anything.
 */
const DAYPART =
  '(?:abends?|morgens?|vormittags?|mittags?|nachmittags?|nachts?|evening|morning|afternoon|night|noon)';

/**
 * A day word only counts when a time follows it, so "Sonntagabend" alone yields
 * no time at all rather than a start on some arbitrary day.
 */
const prefixPattern = (words: string, options: { lead: string; plural: boolean }): RegExp =>
  new RegExp(`^${options.lead}(?:${words})${options.plural ? 's?' : ''}\\s*${DAYPART}?\\s+`);

/** No plural: "morgens" is the daypart "in the mornings", not "tomorrow". */
const OFFSETS: ReadonlyArray<readonly [RegExp, number]> = (
  [
    ['uebermorgen|day after tomorrow', 2],
    ['morgen|tomorrow', 1],
    ['heute|today', 0],
  ] as const
).map(([words, days]) => [prefixPattern(words, { lead: '', plural: false }), days]);

/** ISO weekday numbers, matching Temporal's `dayOfWeek`. */
const WEEKDAYS: ReadonlyArray<readonly [RegExp, number]> = (
  [
    ['montag|monday', 1],
    ['dienstag|tuesday', 2],
    ['mittwoch|wednesday', 3],
    ['donnerstag|thursday', 4],
    ['freitag|friday', 5],
    ['samstag|sonnabend|saturday', 6],
    ['sonntag|sunday', 7],
  ] as const
).map(([words, weekday]) => [
  prefixPattern(words, { lead: '(?:(?:am|on)\\s+)?', plural: true }),
  weekday,
]);

export interface StrippedDayAnchor {
  readonly rest: string;
  readonly anchor: DayAnchor;
}

export const stripDayAnchor = (input: string): StrippedDayAnchor => {
  for (const [pattern, weekday] of WEEKDAYS) {
    const match = pattern.exec(input);
    if (match !== null) {
      return { rest: input.slice(match[0].length), anchor: { kind: 'weekday', weekday } };
    }
  }

  for (const [pattern, days] of OFFSETS) {
    const match = pattern.exec(input);
    if (match !== null) {
      return { rest: input.slice(match[0].length), anchor: { kind: 'offset', days } };
    }
  }

  return { rest: input, anchor: { kind: 'none' } };
};
