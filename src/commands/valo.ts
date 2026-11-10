import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../discord/types.ts';
import { createCallPickupCommand } from './callPickup.ts';

const definition = new SlashCommandBuilder()
  .setName('valo')
  .setDescription('Call a pickup game')
  .setDescriptionLocalizations({ de: 'Ruf eine Valorant-Runde aus' })
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('info')
      .setDescription('Free text, any time in it is picked up automatically')
      .setDescriptionLocalizations({
        de: 'Freitext, eine enthaltene Uhrzeit wird automatisch erkannt',
      })
      .setMaxLength(200)
      .setRequired(false),
  );

export const valoCommand: SlashCommand = createCallPickupCommand(definition.toJSON(), 'game');
