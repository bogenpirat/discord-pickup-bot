import { err, ok, type Result } from '../../../lib/result.ts';
import type { TimeParseErrorCode, WallClock } from '../types.ts';

interface ColloquialRule {
  readonly pattern: RegExp;
  readonly hourOffset: number;
  readonly minute: number;
}

const RULES: readonly ColloquialRule[] = [
  { pattern: /^halb\s*(\d{1,2})$/, hourOffset: -1, minute: 30 },
  { pattern: /^half past\s+(\d{1,2})$/, hourOffset: 0, minute: 30 },
  { pattern: /^viertel\s+nach\s+(\d{1,2})$/, hourOffset: 0, minute: 15 },
  { pattern: /^quarter past\s+(\d{1,2})$/, hourOffset: 0, minute: 15 },
  { pattern: /^viertel\s+vor\s+(\d{1,2})$/, hourOffset: -1, minute: 45 },
  { pattern: /^quarter to\s+(\d{1,2})$/, hourOffset: -1, minute: 45 },
  { pattern: /^dreiviertel\s*(\d{1,2})$/, hourOffset: -1, minute: 45 },
  { pattern: /^viertel\s*(\d{1,2})$/, hourOffset: -1, minute: 15 },
];

export const parseColloquial = (
  input: string,
): Result<WallClock, TimeParseErrorCode> | undefined => {
  for (const rule of RULES) {
    const match = rule.pattern.exec(input);
    if (match === null) {
      continue;
    }

    const spoken = Number(match[1]);
    if (spoken < 1 || spoken > 24) {
      return err('invalidHour');
    }

    const hour = spoken + rule.hourOffset;
    if (hour < 0 || hour > 23) {
      return err('invalidHour');
    }

    return ok({ hour, minute: rule.minute, eveningEligible: spoken <= 12 });
  }

  return undefined;
};
