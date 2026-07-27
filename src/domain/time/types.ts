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

export interface DayPrefix {
  readonly days: number;
  readonly explicit: boolean;
}

export type RelativeExpression =
  | { readonly kind: 'duration'; readonly minutes: number }
  | { readonly kind: 'immediate' };

export type TimeExpression =
  | { readonly kind: 'wall'; readonly wall: WallClock }
  | RelativeExpression;

export const MAX_DURATION_MINUTES = 14 * 24 * 60;
