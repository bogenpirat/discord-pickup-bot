import {
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  InteractionContextType,
  MessageFlags,
  type SendableChannels,
  SlashCommandBuilder,
  type TextBasedChannel,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { GuildSettings } from '../db/repositories/guildSettingsRepository.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { extractStartTime } from '../domain/time/extract.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

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

/**
 * Where a pickup ended up, and whether that was the caller's own channel. The
 * two failures are kept apart because they need different advice: one asks an
 * admin to set a fallback, the other to fix permissions.
 */
type PickupTarget =
  | { readonly kind: 'here'; readonly channel: SendableChannels }
  | { readonly kind: 'fallback'; readonly channel: SendableChannels }
  | { readonly kind: 'noFallback' }
  | { readonly kind: 'unavailable' };

const asSendable = (
  channel: GuildBasedChannel | TextBasedChannel | null,
): SendableChannels | null => {
  if (channel === null || !channel.isTextBased() || !channel.isSendable()) {
    return null;
  }
  return channel;
};

/**
 * A pickup belongs in the channel it was called for, so the invoking channel
 * wins. The configured channel only steps in when the bot cannot write there,
 * so a locked-down channel does not swallow the call entirely.
 */
const resolveTarget = async (
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  settings: GuildSettings,
): Promise<PickupTarget> => {
  // The interaction usually carries its own channel; the fetch is for the rare
  // case where discord.js could not build one from the payload.
  const invoked =
    interaction.channel ??
    (interaction.channelId === null
      ? null
      : await guild.channels.fetch(interaction.channelId).catch(() => null));

  const here = asSendable(invoked);
  if (here !== null) {
    return { kind: 'here', channel: here };
  }

  if (settings.pickupChannelId === null) {
    return { kind: 'noFallback' };
  }

  const configured = asSendable(
    await guild.channels.fetch(settings.pickupChannelId).catch(() => null),
  );
  return configured === null ? { kind: 'unavailable' } : { kind: 'fallback', channel: configured };
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));

  if (!interaction.inGuild() || interaction.guild === null) {
    await replyEphemeral(interaction, strings.guildOnly);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = context.settings.get(interaction.guildId);
  const target = await resolveTarget(interaction, interaction.guild, settings);
  if (target.kind === 'noFallback') {
    await interaction.editReply({ content: strings.noFallbackChannel });
    return;
  }
  if (target.kind === 'unavailable') {
    await interaction.editReply({ content: strings.channelUnavailable });
    return;
  }

  const channel = target.channel;

  const info = (interaction.options.getString('info') ?? '').trim();
  const extracted = extractStartTime(info, settings.timezone, context.now());

  const pickupId = context.pickups.create({
    guildId: interaction.guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    startsAt: extracted.startsAt === null ? null : extracted.startsAt.epochMilliseconds,
    startsAtText: null,
    note: info === '' ? null : info,
  });

  const pickup = context.pickups.findById(pickupId);
  if (pickup === undefined) {
    await interaction.editReply({ content: strings.unexpectedError });
    return;
  }

  try {
    const message = await channel.send(
      renderPickupMessage({
        pickup,
        responses: [],
        mentionRoleId: settings.mentionRoleId,
        emojis: settings.emojis,
        guildName: interaction.guild.name,
        publicBaseUrl: context.publicBaseUrl,
      }),
    );
    context.pickups.attachMessage(pickupId, message.id);

    // The calendar link points back at this very message, so it can only be
    // built on a second pass — Discord hands out the id on send. A failure here
    // costs the link, not the pickup, which is already up.
    const posted = context.pickups.findById(pickupId);
    if (posted !== undefined && posted.startsAt !== null) {
      await message
        .edit(
          renderPickupMessage({
            pickup: posted,
            responses: [],
            mentionRoleId: settings.mentionRoleId,
            emojis: settings.emojis,
            guildName: interaction.guild.name,
            publicBaseUrl: context.publicBaseUrl,
          }),
        )
        .catch((error: unknown) => {
          context.logger.warn(
            { err: error, guildId: interaction.guildId, pickupId },
            'failed to attach calendar link',
          );
        });
    }

    const notice = info !== '' && extracted.startsAt === null ? `\n${strings.noTimeFound}` : '';
    const confirmation =
      target.kind === 'fallback'
        ? strings.postedElsewhere(channel.id, message.url)
        : strings.posted(message.url);
    await interaction.editReply({ content: `${confirmation}${notice}` });
  } catch (error) {
    context.pickups.remove(pickupId);
    context.logger.error({ err: error, guildId: interaction.guildId }, 'failed to post pickup');
    await interaction.editReply({ content: strings.channelUnavailable });
  }
};

export const valoCommand: SlashCommand = {
  name: 'valo',
  definition: definition.toJSON(),
  execute,
};
