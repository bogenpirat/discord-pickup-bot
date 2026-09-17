import { describe, expect, it } from 'vitest';
import { parseSteamReleaseTimestamp } from '../../../src/domain/steam/parseReleaseTimestamp.ts';

/** Shape taken verbatim from the live store page for app 4815930. */
const REAL_MARKUP =
  '<div class="" data-featuretarget="appreviews" data-props="{&quot;appid&quot;:4815930,' +
  '&quot;app_release_date&quot;:&quot;1789760580&quot;,&quot;appname&quot;:&quot;The Door Factory&quot;}">';

describe('parseSteamReleaseTimestamp', () => {
  it('reads the release timestamp out of the real store page markup', () => {
    const instant = parseSteamReleaseTimestamp(REAL_MARKUP);
    expect(instant?.toString()).toBe('2026-09-18T19:43:00Z');
  });

  it('resolves to the evening of the announced day, not its midnight', () => {
    const instant = parseSteamReleaseTimestamp(REAL_MARKUP);
    const berlin = instant?.toZonedDateTimeISO('Europe/Berlin');

    // The appdetails API only said "18 Sep, 2026", which the watcher used to
    // read as midnight Berlin — almost 22 hours before the real release.
    expect(berlin?.toPlainDate().toString()).toBe('2026-09-18');
    expect(berlin?.hour).toBe(21);
  });

  it('accepts unescaped json', () => {
    const instant = parseSteamReleaseTimestamp('{"app_release_date":"1191999600"}');
    expect(instant?.toString()).toBe('2007-10-10T07:00:00Z');
  });

  it.each([
    ['markup without the field', '<html><body>Coming soon</body></html>'],
    ['an empty document', ''],
    ['a non-numeric value', 'app_release_date&quot;:&quot;soon&quot;'],
    ['a zero timestamp', 'app_release_date&quot;:&quot;0&quot;'],
  ])('returns null for %s', (_label, html) => {
    expect(parseSteamReleaseTimestamp(html)).toBeNull();
  });
});
