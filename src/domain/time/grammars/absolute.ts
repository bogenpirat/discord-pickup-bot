import { err, ok, type Result } from '../../../lib/result.ts';
import type { TimeParseErrorCode, WallClock } from '../types.ts';

const WITH_MERIDIEM = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/;
const WITH_MINUTES = /^(\d{1,2})[:.](\d{2})$/;
const BARE_HOUR = /^(\d{1,2})$/;

const applyMeridiem = (hour: number, isPm: boolean): number => {
  if (!isPm) {
    return hour === 12 ? 0 : hour;
  }
  return hour === 12 ? 12 : hour + 12;
};

const validate = (hour: number, minute: number): Result<WallClock, TimeParseErrorCode> => {
  if (hour > 23) {
    return err('invalidHour');
  }
  if (minute > 59) {
    return err('invalidMinute');
  }
  return ok({ hour, minute, eveningEligible: false });
};

export const parseAbsolute = (input: string): Result<WallClock, TimeParseErrorCode> | undefined => {
  const meridiem = WITH_MERIDIEM.exec(input);
  if (meridiem !== null) {
    const hour = Number(meridiem[1]);
    const minute = meridiem[2] === undefined ? 0 : Number(meridiem[2]);
    if (hour < 1 || hour > 12) {
      return err('invalidHour');
    }
    if (minute > 59) {
      return err('invalidMinute');
    }
    return ok({ hour: applyMeridiem(hour, input.endsWith('pm')), minute, eveningEligible: false });
  }

  const withMinutes = WITH_MINUTES.exec(input);
  if (withMinutes !== null) {
    return validate(Number(withMinutes[1]), Number(withMinutes[2]));
  }

  const bare = BARE_HOUR.exec(input);
  if (bare !== null) {
    const hour = Number(bare[1]);
    if (hour > 23) {
      return err('invalidHour');
    }
    return ok({ hour, minute: 0, eveningEligible: true });
  }

  return undefined;
};
