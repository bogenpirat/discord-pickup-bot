import type { DayPrefix } from '../types.ts';

const PREFIXES: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(uebermorgen|day after tomorrow)\s+/, 2],
  [/^(morgen|tomorrow)\s+/, 1],
  [/^(heute|today)\s+/, 0],
];

export interface StrippedDayPrefix {
  readonly rest: string;
  readonly prefix: DayPrefix;
}

export const stripDayPrefix = (input: string): StrippedDayPrefix => {
  for (const [pattern, days] of PREFIXES) {
    const match = pattern.exec(input);
    if (match !== null) {
      return { rest: input.slice(match[0].length), prefix: { days, explicit: true } };
    }
  }

  return { rest: input, prefix: { days: 0, explicit: false } };
};
