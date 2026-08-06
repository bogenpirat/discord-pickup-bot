import { err, ok, type Result } from '../../lib/result.ts';
import type { DayAnchor, TimeParseErrorCode, WallClock } from './types.ts';

const DAYS_PER_WEEK = 7;

const applyEveningPreference = (wall: WallClock): WallClock => {
  if (!wall.eveningEligible || wall.hour >= 12) {
    return wall;
  }
  return { ...wall, hour: wall.hour === 0 ? 12 : wall.hour + 12 };
};

export const resolveWallClock = (
  wall: WallClock,
  anchor: DayAnchor,
  now: Temporal.ZonedDateTime,
): Result<Temporal.ZonedDateTime, TimeParseErrorCode> => {
  const resolved = applyEveningPreference(wall);
  const plainTime = Temporal.PlainTime.from({ hour: resolved.hour, minute: resolved.minute });

  const at = (days: number): Temporal.ZonedDateTime =>
    now.toPlainDate().add({ days }).toZonedDateTime({ timeZone: now.timeZoneId, plainTime });

  const isAhead = (candidate: Temporal.ZonedDateTime): boolean =>
    Temporal.ZonedDateTime.compare(candidate, now) > 0;

  if (anchor.kind === 'weekday') {
    // Today counts as that weekday only while the time is still ahead; otherwise
    // the named day means the one a week out.
    const days = (anchor.weekday - now.dayOfWeek + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    const candidate = at(days);
    return ok(isAhead(candidate) ? candidate : at(days + DAYS_PER_WEEK));
  }

  const candidate = at(anchor.kind === 'offset' ? anchor.days : 0);
  if (isAhead(candidate)) {
    return ok(candidate);
  }

  if (anchor.kind === 'offset') {
    return err('pastTime');
  }

  return ok(at(1));
};
