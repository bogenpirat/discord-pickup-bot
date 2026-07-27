import { type Interaction, PermissionFlagsBits } from 'discord.js';
import type { GuildSettings } from '../db/repositories/guildSettingsRepository.ts';

export const memberRoleIds = (interaction: Interaction): readonly string[] => {
  const member = interaction.member;
  if (member === null) {
    return [];
  }
  const roles = member.roles;
  return Array.isArray(roles) ? roles : [...roles.cache.keys()];
};

export const isGuildManager = (interaction: Interaction): boolean =>
  interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;

export const isPowerUser = (interaction: Interaction, powerUserIds: readonly string[]): boolean =>
  powerUserIds.includes(interaction.user.id);

export const canManageConfig = (
  interaction: Interaction,
  powerUserIds: readonly string[],
): boolean => isGuildManager(interaction) || isPowerUser(interaction, powerUserIds);

export const hasConfigRole = (interaction: Interaction, settings: GuildSettings): boolean =>
  settings.configRoleId !== null && memberRoleIds(interaction).includes(settings.configRoleId);

export const canUseConfig = (
  interaction: Interaction,
  settings: GuildSettings,
  powerUserIds: readonly string[],
): boolean => canManageConfig(interaction, powerUserIds) || hasConfigRole(interaction, settings);
