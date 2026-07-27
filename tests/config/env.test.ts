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
