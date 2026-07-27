import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { CustomIdAction } from './customId.ts';

export interface SlashCommand {
  readonly name: string;
  readonly definition: RESTPostAPIApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction, context: AppContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, context: AppContext): Promise<void>;
}

export type ButtonHandlers = {
  readonly [A in CustomIdAction['action']]: (
    interaction: ButtonInteraction,
    parsed: Extract<CustomIdAction, { action: A }>,
    context: AppContext,
  ) => Promise<void>;
};
