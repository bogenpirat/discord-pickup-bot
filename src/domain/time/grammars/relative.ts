import { err, ok, type Result } from '../../../lib/result.ts';
import {
  MAX_DURATION_MINUTES,
  type RelativeExpression,
  type TimeParseErrorCode,
} from '../types.ts';

const IMMEDIATE = /^(gleich|jetzt|sofort|demnaechst|now|right now)$/;
const LEAD_IN = /^in\s+/;

const WORD_DURATIONS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^einer viertelstunde$/, 15],
  [/^einer halben stunde$/, 30],
  [/^einer stunde$/, 60],
  [/^einem moment$/, 5],
  [/^a quarter of an hour$/, 15],
  [/^half an hour$/, 30],
  [/^an hour$/, 60],
];

const HOUR_UNITS = new Set(['h', 'std', 'stunde', 'stunden', 'hour', 'hours']);
const MINUTE_UNITS = new Set(['m', 'min', 'mins', 'minute', 'minuten', 'minutes']);

const UNIT_TOKEN = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/g;

const parseUnits = (body: string): number | undefined => {
  let total = 0;
  let matches = 0;
  let known = true;

  const leftover = body.replace(
    UNIT_TOKEN,
    (_full: string, amount: string, unit: string): string => {
      matches += 1;
      if (HOUR_UNITS.has(unit)) {
        total += Number(amount) * 60;
      } else if (MINUTE_UNITS.has(unit)) {
        total += Number(amount);
      } else {
        known = false;
      }
      return '';
    },
  );

  if (!known || matches === 0 || leftover !== '') {
    return undefined;
  }

  return total;
};

export const parseRelative = (
  input: string,
): Result<RelativeExpression, TimeParseErrorCode> | undefined => {
  if (IMMEDIATE.test(input)) {
    return ok({ kind: 'immediate' });
  }

  const leadIn = LEAD_IN.exec(input);
  if (leadIn === null) {
    return undefined;
  }

  const body = input.slice(leadIn[0].length).trim();

  for (const [pattern, minutes] of WORD_DURATIONS) {
    if (pattern.test(body)) {
      return ok({ kind: 'duration', minutes });
    }
  }

  const minutes = parseUnits(body);
  if (minutes === undefined) {
    return undefined;
  }
  if (minutes <= 0) {
    return err('nonPositiveDuration');
  }
  if (minutes > MAX_DURATION_MINUTES) {
    return err('durationTooLong');
  }

  return ok({ kind: 'duration', minutes: Math.round(minutes) });
};
