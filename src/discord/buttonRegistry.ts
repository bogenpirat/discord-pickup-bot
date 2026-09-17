import type { ButtonInteraction } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { describeButton } from '../audit/subject.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';
import { decodeCustomId } from './customId.ts';
import { replyEphemeral } from './reply.ts';
import type { ButtonHandlers } from './types.ts';

export interface ButtonRegistry {
  dispatch(interaction: ButtonInteraction, context: AppContext): Promise<void>;
}

export const createButtonRegistry = (handlers: ButtonHandlers): ButtonRegistry => ({
  dispatch: async (interaction, context) => {
    const decoded = decodeCustomId(interaction.customId);
    if (!decoded.ok) {
      if (decoded.error !== 'foreignNamespace') {
        context.logger.warn({ customId: interaction.customId }, 'undecodable custom id');
      }
      return;
    }

    const action = decoded.value;

    try {
      await context.audit.record(describeButton(interaction, action), async () => {
        if (action.action === 'respond') {
          await handlers.respond(interaction, action, context);
          return;
        }
        await handlers.close(interaction, action, context);
      });
    } catch (error) {
      context.logger.error(
        { err: error, customId: interaction.customId },
        'button interaction failed',
      );
      const strings = stringsFor(resolveLocale(interaction.locale));
      await replyEphemeral(interaction, strings.unexpectedError).catch(() => undefined);
    }
  },
});
