import {
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  MessageFlags,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type SendableChannels,
  type TextBasedChannel,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { fallbackChannelFor, mentionRoleFor } from '../db/repositories/guildSettingsRepository.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import type { PickupTheme } from '../domain/pickupTheme.ts';
import { extractStartTime } from '../domain/time/extract.ts';
import { renderPickupMessage } from '../ui/pickupMessage.ts';
import { callStringsFor, resolveLocale, stringsFor } from '../ui/strings.ts';

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
  fallbackChannelId: string | null,
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

  if (fallbackChannelId === null) {
    return { kind: 'noFallback' };
  }

  const configured = asSendable(await guild.channels.fetch(fallbackChannelId).catch(() => null));
  return configured === null ? { kind: 'unavailable' } : { kind: 'fallback', channel: configured };
};

const callPickup =
  (theme: PickupTheme) =>
  async (interaction: ChatInputCommandInteraction, context: AppContext): Promise<void> => {
    const strings = stringsFor(resolveLocale(interaction.locale));
    const replies = callStringsFor(strings, theme);

    if (!interaction.inGuild() || interaction.guild === null) {
      await replyEphemeral(interaction, strings.guildOnly);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = context.settings.get(interaction.guildId);
    const mentionRoleId = mentionRoleFor(settings, theme);
    const target = await resolveTarget(
      interaction,
      interaction.guild,
      fallbackChannelFor(settings, theme),
    );
    if (target.kind === 'noFallback') {
      await interaction.editReply({ content: replies.noFallbackChannel });
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
      theme,
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
          mentionRoleId,
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
              mentionRoleId,
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

      const notice = info !== '' && extracted.startsAt === null ? `\n${replies.noTimeFound}` : '';
      const confirmation =
        target.kind === 'fallback'
          ? replies.postedElsewhere(channel.id, message.url)
          : replies.posted(message.url);
      await interaction.editReply({ content: `${confirmation}${notice}` });
    } catch (error) {
      context.pickups.remove(pickupId);
      context.logger.error({ err: error, guildId: interaction.guildId }, 'failed to post pickup');
      await interaction.editReply({ content: strings.channelUnavailable });
    }
  };

/**
 * A command that calls a pickup of one theme. The definition must carry the
 * optional `info` string option the handler reads.
 */
export const createCallPickupCommand = (
  definition: RESTPostAPIChatInputApplicationCommandsJSONBody,
  theme: PickupTheme,
): SlashCommand => ({
  name: definition.name,
  definition,
  execute: callPickup(theme),
});
