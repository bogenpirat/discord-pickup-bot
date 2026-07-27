import type { ButtonInteraction } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { withTransaction } from '../db/database.ts';
import type { CustomIdAction } from '../discord/customId.ts';
import { replyEphemeral } from '../discord/reply.ts';
import { applyChoice } from '../domain/pickupState.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

export const handleRespond = async (
  interaction: ButtonInteraction,
  parsed: Extract<CustomIdAction, { action: 'respond' }>,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));
  await interaction.deferUpdate();

  await context.mutex.runExclusive(`pickup:${parsed.pickupId}`, async () => {
    const pickup = context.pickups.findById(parsed.pickupId);
    if (pickup === undefined) {
      await replyEphemeral(interaction, strings.pickupNotFound);
      return;
    }

    if (pickup.status === 'closed') {
      const settings = context.settings.get(pickup.guildId);
      await interaction.editReply(
        renderPickupMessage({
          pickup,
          responses: context.responses.listByPickup(pickup.id),
          mentionRoleId: settings.mentionRoleId,
        }),
      );
      await replyEphemeral(interaction, strings.pickupAlreadyClosed);
      return;
    }

    const current = context.responses.listByPickup(pickup.id);
    const applied = applyChoice(current, interaction.user.id, parsed.choice, Date.now());

    withTransaction(context.db, () => {
      if (applied.change.kind === 'removed') {
        context.responses.remove(pickup.id, interaction.user.id);
        return;
      }
      context.responses.set(pickup.id, interaction.user.id, parsed.choice, Date.now());
    });

    const settings = context.settings.get(pickup.guildId);
    await interaction.editReply(
      renderPickupMessage({
        pickup,
        responses: applied.responses,
        mentionRoleId: settings.mentionRoleId,
      }),
    );
  });
};
