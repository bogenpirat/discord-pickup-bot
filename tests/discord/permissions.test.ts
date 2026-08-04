import { describe, expect, it } from 'vitest';
import type { GuildSettings } from '../../src/db/repositories/guildSettingsRepository.ts';
import {
  canManageConfig,
  canUseConfig,
  hasConfigRole,
  isGuildManager,
  isPowerUser,
  memberRoleIds,
} from '../../src/discord/permissions.ts';
import { NO_CHOICE_EMOJIS } from '../../src/domain/pickupChoice.ts';
import { createFakeCommandInteraction } from '../helpers/fakes.ts';

const settings = (configRoleId: string | null): GuildSettings => ({
  guildId: 'guild-1',
  pickupChannelId: null,
  mentionRoleId: null,
  configRoleId,
  emojis: NO_CHOICE_EMOJIS,
  timezone: 'Europe/Berlin',
  steamWatchChannelId: null,
});

const member = (options: Parameters<typeof createFakeCommandInteraction>[0] = {}) =>
  createFakeCommandInteraction(options).interaction;

describe('memberRoleIds', () => {
  it('reads an array of role ids', () => {
    expect(memberRoleIds(member({ roleIds: ['a', 'b'] }))).toEqual(['a', 'b']);
  });

  it('is empty when there is no member', () => {
    expect(memberRoleIds(member({ guildId: null }))).toEqual([]);
  });

  it('is empty when the member holds no roles', () => {
    expect(memberRoleIds(member())).toEqual([]);
  });
});

describe('isGuildManager', () => {
  it.each([
    [true, true],
    [false, false],
  ])('reports %s for manage server = %s', (expected, manageGuild) => {
    expect(isGuildManager(member({ manageGuild }))).toBe(expected);
  });
});

describe('isPowerUser', () => {
  it('matches a configured id', () => {
    expect(isPowerUser(member({ userId: 'power-1' }), ['power-1'])).toBe(true);
  });

  it('does not match another id', () => {
    expect(isPowerUser(member({ userId: 'someone' }), ['power-1'])).toBe(false);
  });

  it('is false when no power users are configured', () => {
    expect(isPowerUser(member({ userId: 'power-1' }), [])).toBe(false);
  });
});

describe('hasConfigRole', () => {
  it('matches when the member holds the configured role', () => {
    expect(hasConfigRole(member({ roleIds: ['role-admin'] }), settings('role-admin'))).toBe(true);
  });

  it('does not match another role', () => {
    expect(hasConfigRole(member({ roleIds: ['role-other'] }), settings('role-admin'))).toBe(false);
  });

  it('is false when no config role is set', () => {
    expect(hasConfigRole(member({ roleIds: ['role-admin'] }), settings(null))).toBe(false);
  });
});

describe('canManageConfig', () => {
  it.each([
    ['a guild manager', { manageGuild: true }, [] as string[], true],
    ['a power user', { userId: 'power-1' }, ['power-1'], true],
    ['a plain member', {}, [] as string[], false],
    ['a config role holder', { roleIds: ['role-admin'] }, [] as string[], false],
  ])('reports %s as %s', (_label, options, powerUsers, expected) => {
    expect(canManageConfig(member(options), powerUsers)).toBe(expected);
  });
});

describe('canUseConfig', () => {
  it.each([
    ['a guild manager', { manageGuild: true }, [] as string[], null, true],
    ['a power user', { userId: 'power-1' }, ['power-1'], null, true],
    ['a config role holder', { roleIds: ['role-admin'] }, [] as string[], 'role-admin', true],
    ['a plain member', {}, [] as string[], 'role-admin', false],
    ['a holder of an unrelated role', { roleIds: ['nope'] }, [] as string[], 'role-admin', false],
  ])('reports %s as %s', (_label, options, powerUsers, configRole, expected) => {
    expect(canUseConfig(member(options), settings(configRole), powerUsers)).toBe(expected);
  });
});
