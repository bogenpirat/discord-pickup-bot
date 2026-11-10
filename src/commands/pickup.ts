import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../discord/types.ts';
import { createCallPickupCommand } from './callPickup.ts';

const definition = new SlashCommandBuilder()
  .setName('pickup')
  .setDescription('Call a movie night')
  .setDescriptionLocalizations({ de: 'Ruf einen Filmabend aus' })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('info')
      .setDescription('The movie or free text, any time in it is picked up automatically')
      .setDescriptionLocalizations({
        de: 'Der Film oder Freitext, eine enthaltene Uhrzeit wird automatisch erkannt',
      })
      .setMaxLength(200)
      .setRequired(false),
  );

/** A movie night: its own role and fallback channel, dressed up as a cinema showing. */
export const pickupCommand: SlashCommand = createCallPickupCommand(definition.toJSON(), 'cinema');
