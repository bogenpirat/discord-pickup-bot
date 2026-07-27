import { err, ok, type Result } from '../../lib/result.ts';
import { parseAbsolute } from './grammars/absolute.ts';
import { parseColloquial } from './grammars/colloquial.ts';
import { stripDayPrefix } from './grammars/dayPrefix.ts';
import { parseRelative } from './grammars/relative.ts';
import { normalize } from './normalize.ts';
import { resolveWallClock } from './resolve.ts';
import type { TimeParseError, TimeParseErrorCode, WallClock } from './types.ts';

const fail = (code: TimeParseErrorCode, input: string): Result<never, TimeParseError> =>
  err({ code, input });

export const parseStartTime = (
  input: string,
  timeZone: string,
  now: Temporal.Instant,
): Result<Temporal.ZonedDateTime, TimeParseError> => {
  const normalized = normalize(input);
  if (normalized === '') {
    return fail('empty', input);
  }

  const zonedNow = now.toZonedDateTimeISO(timeZone);
  const { rest, prefix } = stripDayPrefix(normalized);

  const relative = parseRelative(rest);
  if (relative !== undefined) {
    if (!relative.ok) {
      return fail(relative.error, input);
    }
    if (prefix.explicit) {
      return fail('unrecognized', input);
    }
    if (relative.value.kind === 'immediate') {
      return ok(zonedNow);
    }
    return ok(zonedNow.add({ minutes: relative.value.minutes }));
  }

  const wall: Result<WallClock, TimeParseErrorCode> | undefined =
    parseColloquial(rest) ?? parseAbsolute(rest);

  if (wall === undefined) {
    return fail('unrecognized', input);
  }
  if (!wall.ok) {
    return fail(wall.error, input);
  }

  const resolved = resolveWallClock(wall.value, prefix, zonedNow);
  if (!resolved.ok) {
    return fail(resolved.error, input);
  }

  return ok(resolved.value);
};
