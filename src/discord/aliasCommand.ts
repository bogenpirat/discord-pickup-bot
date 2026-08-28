import type { SlashCommand } from './types.ts';

/**
 * A second name for an existing command. Discord has no notion of aliases, so
 * the whole definition is registered again under the new name and dispatched to
 * the same handler — options, descriptions and their localizations stay in
 * lockstep with the original by construction.
 *
 * Localized *names* are dropped: they translate the original name, not this one.
 */
export const aliasCommand = (command: SlashCommand, name: string): SlashCommand => ({
  ...command,
  name,
  definition: { ...command.definition, name, name_localizations: null },
});
