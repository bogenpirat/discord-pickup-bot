import { describe, expect, it } from 'vitest';
import { APP_LOCALES, resolveLocale, STRINGS, stringsFor } from '../../src/ui/strings.ts';

describe('resolveLocale', () => {
  it.each([
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['de', 'de'],
    ['de-CH', 'de'],
    ['fr', 'de'],
    [null, 'de'],
    [undefined, 'de'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });
});

describe('string tables', () => {
  it('defines the same keys in every locale', () => {
    const [first, ...rest] = APP_LOCALES.map((locale) => Object.keys(STRINGS[locale]).sort());
    for (const keys of rest) {
      expect(keys).toEqual(first);
    }
  });

  it.each([...APP_LOCALES])('resolves every value for %s', (locale) => {
    const strings = stringsFor(locale);
    for (const [key, value] of Object.entries(strings)) {
      if (typeof value === 'function') {
        continue;
      }
      expect(value, key).not.toBe('');
    }
  });

  it.each([...APP_LOCALES])('produces a non-empty result from every template in %s', (locale) => {
    const strings = stringsFor(locale);

    expect(strings.moreNames(3)).toContain('3');
    expect(strings.invalidTimezone('Europe/Atlantis')).toContain('Europe/Atlantis');
    expect(strings.configChannelSaved('c1')).toContain('<#c1>');
    expect(strings.configRoleSaved('r1')).toContain('<@&r1>');
    expect(strings.configTimezoneSaved('UTC')).toContain('UTC');
    expect(strings.posted('https://discord.com/x')).toContain('https://discord.com/x');

    expect(strings.configAdminRoleSaved('r2')).toContain('<@&r2>');

    expect(strings.configEmojiSaved('Dabei', '🔥')).toContain('🔥');
    expect(strings.configEmojiReset('Dabei', '✅')).toContain('✅');
    expect(strings.invalidEmoji('nope')).toContain('nope');

    const summary = strings.configSummary({
      channel: '<#c1>',
      role: '<@&r1>',
      adminRole: '<@&r2>',
      emojis: '✅ Dabei',
      timezone: 'UTC',
    });
    expect(summary).toContain('<#c1>');
    expect(summary).toContain('<@&r1>');
    expect(summary).toContain('<@&r2>');
    expect(summary).toContain('UTC');
  });

  it.each([...APP_LOCALES])('covers all three choices for %s', (locale) => {
    const strings = stringsFor(locale);
    expect(Object.keys(strings.choice).sort()).toEqual(['in', 'later', 'out']);
  });

  it.each([...APP_LOCALES])('renders every valorant template in %s', (locale) => {
    const strings = stringsFor(locale);
    const account = {
      riotId: 'Bogenpirat#EUW',
      region: 'eu',
      puuid: 'puuid-1',
      linkedAt: '<t:1000:d>',
    };

    expect(strings.invalidRiotId('nope', 'because')).toContain('nope');
    expect(strings.riotAccountNotFound('Nobody#XXX')).toContain('Nobody#XXX');
    expect(strings.riotAccountLinked(account)).toContain('puuid-1');
    expect(strings.riotAccountTaken('Bogenpirat#EUW', 'u1')).toContain('<@u1>');
    expect(strings.riotAccountShown('u1', account)).toContain('<t:1000:d>');
    expect(strings.riotAccountNotLinkedOther('u1')).toContain('<@u1>');
    expect(strings.riotAccountRefreshed(account)).toContain('Bogenpirat#EUW');
    expect(strings.riotAccountUnchanged(account)).toContain('Bogenpirat#EUW');
    expect(strings.valorantProbeOk('10.0')).toContain('10.0');
    expect(strings.valorantProbeFailed('kaputt')).toContain('kaputt');
    expect(strings.valorantBlockedUntil('<t:1000:R>')).toContain('<t:1000:R>');

    const status = strings.valorantApiStatus({
      probe: 'ok',
      used: 4,
      limit: 30,
      waiting: 1,
      requests: 12,
      failures: 2,
      rateLimitHits: 3,
      lastRateLimited: 'nie',
      blocked: 'nein',
    });
    expect(status).toContain('4/30');
    expect(status).toContain('12');
  });

  it.each([...APP_LOCALES])('names every riot id problem in %s', (locale) => {
    const strings = stringsFor(locale);
    expect(Object.keys(strings.riotIdProblem).sort()).toEqual([
      'empty-name',
      'invalid-tag',
      'missing-tag',
      'name-too-long',
    ]);
  });
});
