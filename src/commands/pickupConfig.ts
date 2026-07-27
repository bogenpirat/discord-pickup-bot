import {
  ChannelType,
  type ChatInputCommandInteraction,
  channelMention,
  InteractionContextType,
  PermissionFlagsBits,
  roleMention,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { isValidTimeZone, searchTimeZones } from '../domain/time/timezone.ts';
import { resolveLocale, stringsFor } from '../ui/strings.ts';

const definition = new SlashCommandBuilder()
  .setName('pickup-config')
  .setDescription('Configure the pickup bot for this server')
  .setDescriptionLocalizations({ de: 'Pickup-Bot für diesen Server konfigurieren' })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) !== true) {
    await replyEphemeral(interaction, strings.missingPermission);
    return;
  }

  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

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

  const settings = context.settings.get(guildId);
  await replyEphemeral(
    interaction,
    strings.configSummary(
      settings.pickupChannelId === null ? strings.notSet : channelMention(settings.pickupChannelId),
      settings.mentionRoleId === null ? strings.notSet : roleMention(settings.mentionRoleId),
      settings.timezone,
    ),
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
