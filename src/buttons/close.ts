import { type ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { CustomIdAction } from '../discord/customId.ts';
import { replyEphemeral } from '../discord/reply.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

export const handleClose = async (
  interaction: ButtonInteraction,
  parsed: Extract<CustomIdAction, { action: 'close' }>,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));

  await context.mutex.runExclusive(`pickup:${parsed.pickupId}`, async () => {
    const pickup = context.pickups.findById(parsed.pickupId);
    if (pickup === undefined) {
      await replyEphemeral(interaction, strings.pickupNotFound);
      return;
    }

    const isCreator = pickup.creatorId === interaction.user.id;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
    if (!isCreator && !isAdmin) {
      await replyEphemeral(interaction, strings.notAllowedToClose);
      return;
    }

    if (pickup.status === 'closed') {
      await replyEphemeral(interaction, strings.pickupAlreadyClosed);
      return;
    }

    await interaction.deferUpdate();
    context.pickups.close(pickup.id, Date.now());

    const closed = context.pickups.findById(pickup.id) ?? pickup;
    const settings = context.settings.get(pickup.guildId);

    await interaction.editReply(
      renderPickupMessage({
        pickup: closed,
        responses: context.responses.listByPickup(pickup.id),
        mentionRoleId: settings.mentionRoleId,
      }),
    );
  });
};
