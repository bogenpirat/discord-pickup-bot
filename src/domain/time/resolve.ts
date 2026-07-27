import { err, ok, type Result } from '../../lib/result.ts';
import type { DayPrefix, TimeParseErrorCode, WallClock } from './types.ts';

const applyEveningPreference = (wall: WallClock): WallClock => {
  if (!wall.eveningEligible || wall.hour >= 12) {
    return wall;
  }
  return { ...wall, hour: wall.hour === 0 ? 12 : wall.hour + 12 };
};

export const resolveWallClock = (
  wall: WallClock,
  prefix: DayPrefix,
  now: Temporal.ZonedDateTime,
): Result<Temporal.ZonedDateTime, TimeParseErrorCode> => {
  const resolved = applyEveningPreference(wall);
  const plainTime = Temporal.PlainTime.from({ hour: resolved.hour, minute: resolved.minute });

  const at = (days: number): Temporal.ZonedDateTime =>
    now.toPlainDate().add({ days }).toZonedDateTime({ timeZone: now.timeZoneId, plainTime });

  const candidate = at(prefix.days);
  if (Temporal.ZonedDateTime.compare(candidate, now) > 0) {
    return ok(candidate);
  }

  if (prefix.explicit) {
    return err('pastTime');
  }

  return ok(at(1));
};
