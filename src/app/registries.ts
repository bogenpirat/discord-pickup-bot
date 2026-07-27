import { handleClose } from '../buttons/close.ts';
import { handleRespond } from '../buttons/respond.ts';
import { pickupConfigCommand } from '../commands/pickupConfig.ts';
import { valoCommand } from '../commands/valo.ts';
import { type ButtonRegistry, createButtonRegistry } from '../discord/buttonRegistry.ts';
import { type CommandRegistry, createCommandRegistry } from '../discord/commandRegistry.ts';
import type { SlashCommand } from '../discord/types.ts';

export const COMMANDS: readonly SlashCommand[] = [valoCommand, pickupConfigCommand];

export const buildCommandRegistry = (): CommandRegistry => createCommandRegistry(COMMANDS);

export const buildButtonRegistry = (): ButtonRegistry =>
  createButtonRegistry({ respond: handleRespond, close: handleClose });
