import {
  ChannelType,
  type ChatInputCommandInteraction,
  channelMention,
  InteractionContextType,
  roleMention,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { canManageConfig, canUseConfig } from '../discord/permissions.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { parseEmoji } from '../domain/emoji.ts';
import {
  DEFAULT_CHOICE_EMOJI,
  emojiFor,
  isPickupChoice,
  PICKUP_CHOICES,
} from '../domain/pickupChoice.ts';
import { isValidTimeZone, searchTimeZones } from '../domain/time/timezone.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

const definition = new SlashCommandBuilder()
  .setName('pickup-config')
  .setDescription('Configure the pickup bot for this server')
  .setDescriptionLocalizations({ de: 'Pickup-Bot für diesen Server konfigurieren' })
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('channel')
      .setNameLocalizations({ de: 'kanal' })
      .setDescription('Set the channel pickup calls are posted to')
      .setDescriptionLocalizations({ de: 'Kanal festlegen, in dem Pickups gepostet werden' })
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setNameLocalizations({ de: 'kanal' })
          .setDescription('Target channel')
          .setDescriptionLocalizations({ de: 'Zielkanal' })
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('role')
      .setNameLocalizations({ de: 'rolle' })
      .setDescription('Set the role mentioned in pickup calls')
      .setDescriptionLocalizations({ de: 'Rolle festlegen, die im Pickup erwähnt wird' })
      .addRoleOption((option) =>
        option
          .setName('role')
          .setNameLocalizations({ de: 'rolle' })
          .setDescription('Role to mention, leave empty to clear')
          .setDescriptionLocalizations({ de: 'Rolle, leer lassen zum Entfernen' })
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('admin-role')
      .setNameLocalizations({ de: 'admin-rolle' })
      .setDescription('Set a role that may also use these config commands')
      .setDescriptionLocalizations({
        de: 'Rolle festlegen, die diese Config-Befehle ebenfalls nutzen darf',
      })
      .addRoleOption((option) =>
        option
          .setName('role')
          .setNameLocalizations({ de: 'rolle' })
          .setDescription('Role allowed to configure, leave empty to clear')
          .setDescriptionLocalizations({ de: 'Berechtigte Rolle, leer lassen zum Entfernen' })
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('emoji')
      .setDescription('Set the emoji shown for one of the three options')
      .setDescriptionLocalizations({
        de: 'Emoji für eine der drei Optionen festlegen',
      })
      .addStringOption((option) =>
        option
          .setName('option')
          .setNameLocalizations({ de: 'option' })
          .setDescription('Which of the three options')
          .setDescriptionLocalizations({ de: 'Welche der drei Optionen' })
          .addChoices(
            { name: 'Dabei', value: 'in' },
            { name: 'Später', value: 'later' },
            { name: 'Raus', value: 'out' },
          )
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('emoji')
          .setNameLocalizations({ de: 'emoji' })
          .setDescription('Emoji to use, leave empty to reset to the default')
          .setDescriptionLocalizations({
            de: 'Emoji, leer lassen für das Standard-Emoji',
          })
          .setMaxLength(64)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('timezone')
      .setNameLocalizations({ de: 'zeitzone' })
      .setDescription('Set the time zone used to read start times')
      .setDescriptionLocalizations({ de: 'Zeitzone für die Auswertung von Startzeiten' })
      .addStringOption((option) =>
        option
          .setName('timezone')
          .setNameLocalizations({ de: 'zeitzone' })
          .setDescription('IANA time zone, for example Europe/Berlin')
          .setDescriptionLocalizations({ de: 'IANA-Zeitzone, zum Beispiel Europe/Berlin' })
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('show')
      .setNameLocalizations({ de: 'anzeigen' })
      .setDescription('Show the current configuration')
      .setDescriptionLocalizations({ de: 'Aktuelle Konfiguration anzeigen' }),
  );

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));

  if (!interaction.inGuild()) {
    await replyEphemeral(interaction, strings.guildOnly);
    return;
  }

  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();
  const settings = context.settings.get(guildId);

  if (subcommand === 'admin-role') {
    if (!canManageConfig(interaction, context.powerUserIds)) {
      await replyEphemeral(interaction, strings.adminOnly);
      return;
    }
    const role = interaction.options.getRole('role');
    context.settings.setConfigRole(guildId, role?.id ?? null);
    await replyEphemeral(
      interaction,
      role === null ? strings.configAdminRoleCleared : strings.configAdminRoleSaved(role.id),
    );
    return;
  }

  if (!canUseConfig(interaction, settings, context.powerUserIds)) {
    await replyEphemeral(interaction, strings.missingPermission);
    return;
  }

  if (subcommand === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    context.settings.setPickupChannel(guildId, channel.id);
    await replyEphemeral(interaction, strings.configChannelSaved(channel.id));
    return;
  }

  if (subcommand === 'role') {
    const role = interaction.options.getRole('role');
    context.settings.setMentionRole(guildId, role?.id ?? null);
    await replyEphemeral(
      interaction,
      role === null ? strings.configRoleCleared : strings.configRoleSaved(role.id),
    );
    return;
  }

  if (subcommand === 'emoji') {
    const choice = interaction.options.getString('option', true);
    if (!isPickupChoice(choice)) {
      await replyEphemeral(interaction, strings.unexpectedError);
      return;
    }

    const label = strings.choice[choice];
    const raw = interaction.options.getString('emoji');

    if (raw === null || raw.trim() === '') {
      context.settings.setChoiceEmoji(guildId, choice, null);
      await replyEphemeral(
        interaction,
        strings.configEmojiReset(label, DEFAULT_CHOICE_EMOJI[choice]),
      );
      return;
    }

    const parsed = parseEmoji(raw);
    if (!parsed.ok) {
      await replyEphemeral(interaction, strings.invalidEmoji(raw.trim()));
      return;
    }

    context.settings.setChoiceEmoji(guildId, choice, parsed.value);
    await replyEphemeral(interaction, strings.configEmojiSaved(label, parsed.value));
    return;
  }

  if (subcommand === 'timezone') {
    const timezone = interaction.options.getString('timezone', true).trim();
    if (!isValidTimeZone(timezone)) {
      await replyEphemeral(interaction, strings.invalidTimezone(timezone));
      return;
    }
    context.settings.setTimezone(guildId, timezone);
    await replyEphemeral(interaction, strings.configTimezoneSaved(timezone));
    return;
  }

  await replyEphemeral(
    interaction,
    strings.configSummary({
      channel:
        settings.pickupChannelId === null
          ? strings.notSet
          : channelMention(settings.pickupChannelId),
      role: settings.mentionRoleId === null ? strings.notSet : roleMention(settings.mentionRoleId),
      adminRole:
        settings.configRoleId === null ? strings.notSet : roleMention(settings.configRoleId),
      emojis: PICKUP_CHOICES.map(
        (choice) => `${emojiFor(choice, settings.emojis)} ${strings.choice[choice]}`,
      ).join('  ·  '),
      timezone: settings.timezone,
    }),
  );
};

export const pickupConfigCommand: SlashCommand = {
  name: 'pickup-config',
  definition: definition.toJSON(),
  execute,
  autocomplete: async (interaction) => {
    const query = interaction.options.getFocused();
    const zones = searchTimeZones(query, 25);
    await interaction.respond(zones.map((zone) => ({ name: zone, value: zone })));
  },
};
