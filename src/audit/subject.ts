import {
  ApplicationCommandOptionType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type CommandInteractionOption,
} from 'discord.js';
import type { CustomIdAction } from '../discord/customId.ts';
import type { AuditActor, AuditSubject } from './types.ts';

type OptionValues = Record<string, string | number | boolean>;

interface FlatOptions {
  readonly subcommand?: string | undefined;
  readonly options: OptionValues;
}

/** Channel, role and user options carry the snowflake in `value`, which is what we want. */
const leafValues = (data: readonly CommandInteractionOption[]): OptionValues => {
  const values: OptionValues = {};
  for (const option of data) {
    if (option.value !== undefined) {
      values[option.name] = option.value;
    }
  }
  return values;
};

/**
 * discord.js nests a subcommand's own options one level down, and two under a
 * group. Nothing below that can nest further, so the descent bottoms out.
 */
const flatten = (data: readonly CommandInteractionOption[]): FlatOptions => {
  const first = data[0];

  if (first?.type === ApplicationCommandOptionType.SubcommandGroup) {
    const child = flatten(first.options ?? []);
    return {
      subcommand: child.subcommand === undefined ? first.name : `${first.name} ${child.subcommand}`,
      options: child.options,
    };
  }

  if (first?.type === ApplicationCommandOptionType.Subcommand) {
    return { subcommand: first.name, options: leafValues(first.options ?? []) };
  }

  return { options: leafValues(data) };
};

const actorOf = (interaction: ChatInputCommandInteraction | ButtonInteraction): AuditActor => ({
  guildId: interaction.guildId,
  channelId: interaction.channelId,
  userId: interaction.user.id,
  user: interaction.user.username,
  locale: interaction.locale,
});

export const describeCommand = (interaction: ChatInputCommandInteraction): AuditSubject => {
  const flat = flatten(interaction.options.data);

  return {
    kind: 'command',
    command: interaction.commandName,
    ...(flat.subcommand === undefined ? {} : { subcommand: flat.subcommand }),
    ...actorOf(interaction),
    options: flat.options,
  };
};

export const describeButton = (
  interaction: ButtonInteraction,
  action: CustomIdAction,
): AuditSubject => ({
  kind: 'button',
  action: action.action,
  pickupId: action.pickupId,
  ...(action.action === 'respond' ? { choice: action.choice } : {}),
  ...actorOf(interaction),
});
