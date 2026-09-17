/**
 * The appdetails JSON API only exposes a release *day* ("18 Sep, 2026"), rendered
 * in Steam's own US Pacific timezone. The store page carries the exact release
 * instant as a unix timestamp inside the review widget's props, which is the only
 * public source precise enough to announce a game at the moment it actually ships.
 */
const PATTERN = /app_release_date(?:&quot;|&#34;|")\s*:\s*(?:&quot;|&#34;|")?(\d{1,11})/;

export const parseSteamReleaseTimestamp = (html: string): Temporal.Instant | null => {
  const match = PATTERN.exec(html);
  if (match === null) {
    return null;
  }

  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return null;
  }

  return Temporal.Instant.fromEpochMilliseconds(seconds * 1000);
};
