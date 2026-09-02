import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.ts';

const minimal = { DISCORD_TOKEN: 'token', DISCORD_APP_ID: 'app' };

describe('loadEnv', () => {
  it('applies defaults for optional settings', () => {
    const env = loadEnv(minimal);

    expect(env.DATABASE_PATH).toBe('./data/pickup.db');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('production');
    expect(env.HEARTBEAT_PATH).toBe('/tmp/heartbeat');
    expect(env.DISCORD_DEV_GUILD_ID).toBeUndefined();
  });

  it('keeps provided values', () => {
    const env = loadEnv({
      ...minimal,
      DISCORD_DEV_GUILD_ID: 'guild-1',
      DATABASE_PATH: '/data/pickup.db',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'development',
    });

    expect(env.DISCORD_DEV_GUILD_ID).toBe('guild-1');
    expect(env.DATABASE_PATH).toBe('/data/pickup.db');
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.NODE_ENV).toBe('development');
  });

  it('records no audit log unless a path is given', () => {
    expect(loadEnv(minimal).AUDIT_LOG_PATH).toBeUndefined();
    expect(loadEnv({ ...minimal, AUDIT_LOG_PATH: '' }).AUDIT_LOG_PATH).toBeUndefined();
  });

  it('keeps the audit log path it was given', () => {
    expect(loadEnv({ ...minimal, AUDIT_LOG_PATH: '/audit/audit.log' }).AUDIT_LOG_PATH).toBe(
      '/audit/audit.log',
    );
  });

  it('has no power users by default', () => {
    expect(loadEnv(minimal).POWER_USER_IDS).toEqual([]);
  });

  it.each([
    ['123', ['123']],
    ['123,456', ['123', '456']],
    [' 123 , 456 ', ['123', '456']],
    ['123,,456,', ['123', '456']],
  ])('parses POWER_USER_IDS %s', (value, expected) => {
    expect(loadEnv({ ...minimal, POWER_USER_IDS: value }).POWER_USER_IDS).toEqual(expected);
  });

  it('treats blank values from an env file as unset', () => {
    const env = loadEnv({
      ...minimal,
      DISCORD_DEV_GUILD_ID: '',
      DATABASE_PATH: '',
      LOG_LEVEL: '',
    });

    expect(env.DISCORD_DEV_GUILD_ID).toBeUndefined();
    expect(env.DATABASE_PATH).toBe('./data/pickup.db');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it.each([
    ['DISCORD_TOKEN', { DISCORD_APP_ID: 'app' }],
    ['DISCORD_APP_ID', { DISCORD_TOKEN: 'token' }],
  ])('reports a missing %s', (name, source) => {
    expect(() => loadEnv(source)).toThrow(new RegExp(name));
  });

  it.each([
    ['blank token', { DISCORD_TOKEN: '', DISCORD_APP_ID: 'app' }],
    ['unknown log level', { ...minimal, LOG_LEVEL: 'chatty' }],
    ['unknown node env', { ...minimal, NODE_ENV: 'staging' }],
  ])('rejects an %s', (_label, source) => {
    expect(() => loadEnv(source)).toThrow(/Invalid environment configuration/);
  });
});

describe('http server settings', () => {
  it('leaves the server off by default', () => {
    const env = loadEnv(minimal);

    expect(env.PUBLIC_BASE_URL).toBeUndefined();
    expect(env.HTTP_PORT).toBe(18080);
  });

  // withoutBlanks strips empty values, so an untouched key in .env means "off".
  it('treats a blank base url as absent', () => {
    expect(loadEnv({ ...minimal, PUBLIC_BASE_URL: '' }).PUBLIC_BASE_URL).toBeUndefined();
  });

  it('keeps a configured base url', () => {
    expect(
      loadEnv({ ...minimal, PUBLIC_BASE_URL: 'http://pickup.example.net:18080' }).PUBLIC_BASE_URL,
    ).toBe('http://pickup.example.net:18080');
  });

  it('accepts an https origin behind a proxy', () => {
    expect(
      loadEnv({ ...minimal, PUBLIC_BASE_URL: 'https://pickup.example.net' }).PUBLIC_BASE_URL,
    ).toBe('https://pickup.example.net');
  });

  // Otherwise the button url would come out with a doubled slash.
  it.each([
    ['http://host:18080/', 'http://host:18080'],
    ['http://host:18080///', 'http://host:18080'],
    ['http://host:18080', 'http://host:18080'],
  ])('trims trailing slashes off %o', (value, expected) => {
    expect(loadEnv({ ...minimal, PUBLIC_BASE_URL: value }).PUBLIC_BASE_URL).toBe(expected);
  });

  it.each(['not-a-url', 'pickup.example.net:18080', '18080'])(
    'rejects %o as a base url',
    (value) => {
      expect(() => loadEnv({ ...minimal, PUBLIC_BASE_URL: value })).toThrow(
        /Invalid environment configuration/,
      );
    },
  );

  it('reads the port from a string, as the environment always supplies it', () => {
    expect(loadEnv({ ...minimal, HTTP_PORT: '19090' }).HTTP_PORT).toBe(19090);
  });

  it.each(['80', '8080', '9999', '65536', '0', '-1', 'abc', '18080.5'])(
    'rejects %o as a port',
    (value) => {
      expect(() => loadEnv({ ...minimal, HTTP_PORT: value })).toThrow(
        /Invalid environment configuration/,
      );
    },
  );

  it.each(['10000', '65535'])('accepts %o at the edge of the range', (value) => {
    expect(loadEnv({ ...minimal, HTTP_PORT: value }).HTTP_PORT).toBe(Number(value));
  });
});

describe('valorant api settings', () => {
  it('leaves the key absent and defaults the limit to a basic key', () => {
    const env = loadEnv(minimal);

    expect(env.VALORANT_API_KEY).toBeUndefined();
    expect(env.VALORANT_RATE_LIMIT_PER_MINUTE).toBe(30);
  });

  it('treats a blank key as absent, so an empty line in .env disables the feature', () => {
    expect(loadEnv({ ...minimal, VALORANT_API_KEY: '' }).VALORANT_API_KEY).toBeUndefined();
  });

  it('reads the key when it is set', () => {
    expect(loadEnv({ ...minimal, VALORANT_API_KEY: 'HDEV-abc' }).VALORANT_API_KEY).toBe('HDEV-abc');
  });

  it('coerces the rate limit from its string form', () => {
    expect(
      loadEnv({ ...minimal, VALORANT_RATE_LIMIT_PER_MINUTE: '90' }).VALORANT_RATE_LIMIT_PER_MINUTE,
    ).toBe(90);
  });

  it.each(['0', '-1', '1.5', 'lots', '10001'])('rejects %o as a rate limit', (value) => {
    expect(() => loadEnv({ ...minimal, VALORANT_RATE_LIMIT_PER_MINUTE: value })).toThrow(
      /Invalid environment configuration/,
    );
  });
});

describe('valorant playground', () => {
  it('is absent by default', () => {
    expect(loadEnv(minimal).VALORANT_PLAYGROUND_SECRET).toBeUndefined();
  });

  it('accepts a long url-safe secret', () => {
    const secret = 'abcdefghijklmnopqrstuvwx_-09';
    expect(
      loadEnv({ ...minimal, VALORANT_PLAYGROUND_SECRET: secret }).VALORANT_PLAYGROUND_SECRET,
    ).toBe(secret);
  });

  // The URL is the only thing guarding this page, so a weak one is a config error.
  it.each(['short', 'a'.repeat(23)])('rejects %o as too short to hide behind', (value) => {
    expect(() => loadEnv({ ...minimal, VALORANT_PLAYGROUND_SECRET: value })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it.each([`${'a'.repeat(24)}/x`, `${'a'.repeat(24)}?`, `${'a'.repeat(24)} b`])(
    'rejects %o as not url-safe',
    (value) => {
      expect(() => loadEnv({ ...minimal, VALORANT_PLAYGROUND_SECRET: value })).toThrow(
        /Invalid environment configuration/,
      );
    },
  );
});
