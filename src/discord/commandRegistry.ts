import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { describeCommand } from '../audit/subject.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';
import { replyEphemeral } from './reply.ts';
import type { SlashCommand } from './types.ts';

export interface CommandRegistry {
  readonly definitions: readonly RESTPostAPIApplicationCommandsJSONBody[];
  dispatch(interaction: ChatInputCommandInteraction, context: AppContext): Promise<void>;
  dispatchAutocomplete(interaction: AutocompleteInteraction, context: AppContext): Promise<void>;
}

export const createCommandRegistry = (commands: readonly SlashCommand[]): CommandRegistry => {
  const byName = new Map(commands.map((command) => [command.name, command]));

  return {
    definitions: commands.map((command) => command.definition),

    dispatch: async (interaction, context) => {
      const command = byName.get(interaction.commandName);
      if (command === undefined) {
        return;
      }

      try {
        await context.audit.record(describeCommand(interaction), () =>
          command.execute(interaction, context),
        );
      } catch (error) {
        context.logger.error(
          { err: error, command: interaction.commandName },
          'slash command failed',
        );
        const strings = stringsFor(resolveLocale(interaction.locale));
        await replyEphemeral(interaction, strings.unexpectedError).catch(() => undefined);
      }
    },

    dispatchAutocomplete: async (interaction, context) => {
      const command = byName.get(interaction.commandName);
      if (command?.autocomplete === undefined) {
        return;
      }

      try {
        await command.autocomplete(interaction, context);
      } catch (error) {
        context.logger.error(
          { err: error, command: interaction.commandName },
          'autocomplete failed',
        );
      }
    },
  };
};
