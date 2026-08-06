export type TimeParseErrorCode =
  | 'empty'
  | 'unrecognized'
  | 'invalidHour'
  | 'invalidMinute'
  | 'pastTime'
  | 'nonPositiveDuration'
  | 'durationTooLong';

export interface TimeParseError {
  readonly code: TimeParseErrorCode;
  readonly input: string;
}

export interface WallClock {
  readonly hour: number;
  readonly minute: number;
  readonly eveningEligible: boolean;
}

/**
 * Which day a wall clock belongs to. `offset` comes from heute/morgen/übermorgen
 * and pins an exact date, `weekday` (ISO 1-7) means the next occurrence of that
 * day, and `none` lets the time roll forward on its own.
 */
export type DayAnchor =
  | { readonly kind: 'none' }
  | { readonly kind: 'offset'; readonly days: number }
  | { readonly kind: 'weekday'; readonly weekday: number };

export type RelativeExpression =
  | { readonly kind: 'duration'; readonly minutes: number }
  | { readonly kind: 'immediate' };

export type TimeExpression =
  | { readonly kind: 'wall'; readonly wall: WallClock }
  | RelativeExpression;

export const MAX_DURATION_MINUTES = 14 * 24 * 60;
