import { handleClose } from '../buttons/close.ts';
import { handleRespond } from '../buttons/respond.ts';
import { pickupConfigCommand } from '../commands/pickupConfig.ts';
import { valoCommand } from '../commands/valo.ts';
import { valoTimeCommand } from '../commands/valoTime.ts';
import { aliasCommand } from '../discord/aliasCommand.ts';
import { type ButtonRegistry, createButtonRegistry } from '../discord/buttonRegistry.ts';
import { type CommandRegistry, createCommandRegistry } from '../discord/commandRegistry.ts';
import type { SlashCommand } from '../discord/types.ts';

export const COMMANDS: readonly SlashCommand[] = [
  valoCommand,
  aliasCommand(valoCommand, 'pickup'),
  valoTimeCommand,
  aliasCommand(valoTimeCommand, 'pickup-time'),
  pickupConfigCommand,
];

export const buildCommandRegistry = (): CommandRegistry => createCommandRegistry(COMMANDS);

export const buildButtonRegistry = (): ButtonRegistry =>
  createButtonRegistry({ respond: handleRespond, close: handleClose });
