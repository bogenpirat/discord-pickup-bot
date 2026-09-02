import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TimestampStyles,
  time,
} from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { RiotAccount } from '../db/repositories/riotAccountRepository.ts';
import { replyEphemeral } from '../discord/reply.ts';
import type { SlashCommand } from '../discord/types.ts';
import { playerCardImageUrl } from '../domain/valorant/media.ts';
import { formatRiotId, parseRiotId } from '../domain/valorant/riotId.ts';
import { playerCardEmbed } from '../ui/playerCard.ts';
import { type RiotAccountParts, resolveLocale, type Strings, stringsFor } from '../ui/strings.ts';
import { describeValorantError } from '../ui/valorantError.ts';
import type { ValorantClient } from '../valorant/client.ts';
import type { ValorantError } from '../valorant/http.ts';
import type { Account } from '../valorant/types.ts';

const definition = new SlashCommandBuilder()
  .setName('valo-account')
  .setDescription('Link your Riot ID so the bot can look up your Valorant stats')
  .setDescriptionLocalizations({
    de: 'Riot-ID verknüpfen, damit der Bot deine Valorant-Statistiken abrufen kann',
  })
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('link')
      .setNameLocalizations({ de: 'verknüpfen' })
      .setDescription('Store your Riot ID')
      .setDescriptionLocalizations({ de: 'Deine Riot-ID hinterlegen' })
      .addStringOption((option) =>
        option
          .setName('riot-id')
          .setNameLocalizations({ de: 'riot-id' })
          .setDescription('Your Riot ID including the tag, for example Name#EUW')
          .setDescriptionLocalizations({ de: 'Deine Riot-ID samt Tag, zum Beispiel Name#EUW' })
          .setMaxLength(64)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('show')
      .setNameLocalizations({ de: 'anzeigen' })
      .setDescription('Show a linked Riot ID')
      .setDescriptionLocalizations({ de: 'Eine hinterlegte Riot-ID anzeigen' })
      .addUserOption((option) =>
        option
          .setName('user')
          .setNameLocalizations({ de: 'mitglied' })
          .setDescription('Whose Riot ID to show, leave empty for your own')
          .setDescriptionLocalizations({ de: 'Wessen Riot-ID, leer lassen für deine eigene' })
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('refresh')
      .setNameLocalizations({ de: 'aktualisieren' })
      .setDescription('Re-read your Riot ID, in case you renamed your account')
      .setDescriptionLocalizations({
        de: 'Riot-ID neu einlesen, falls du deinen Account umbenannt hast',
      }),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unlink')
      .setNameLocalizations({ de: 'trennen' })
      .setDescription('Delete your stored Riot ID')
      .setDescriptionLocalizations({ de: 'Deine hinterlegte Riot-ID löschen' }),
  );

/**
 * The account's player card, as the embed to hang off the reply.
 *
 * Empty rather than absent when there is no picture to show: the id may be one
 * the artwork mirror does not have, and the confirmation still says everything
 * it needs to in words.
 */
const cardArtwork = (context: AppContext, cardId: string | null | undefined) => {
  const imageUrl = playerCardImageUrl(cardId);

  if (imageUrl === null) {
    return [];
  }

  return [
    playerCardEmbed({
      imageUrl,
      name: context.content.findIn('playerCards', cardId)?.name ?? null,
    }),
  ];
};

const partsFor = (account: RiotAccount): RiotAccountParts => ({
  riotId: formatRiotId({ name: account.riotName, tag: account.riotTag }),
  region: account.region,
  puuid: account.puuid,
  linkedAt: time(new Date(account.linkedAt), TimestampStyles.ShortDate),
});

/**
 * A 404 here is not "the API is broken" but "that Riot ID does not exist", which
 * is the one failure the member can actually fix, so it gets its own message.
 */
const describeLookupFailure = (error: ValorantError, riotId: string, strings: Strings): string =>
  error.kind === 'not-found'
    ? strings.riotAccountNotFound(riotId)
    : describeValorantError(error, strings);

const handleLink = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
  client: ValorantClient,
  strings: Strings,
): Promise<void> => {
  const raw = interaction.options.getString('riot-id', true);
  const parsed = parseRiotId(raw);

  if (!parsed.ok) {
    await replyEphemeral(
      interaction,
      strings.invalidRiotId(raw.trim(), strings.riotIdProblem[parsed.error]),
    );
    return;
  }

  const riotId = formatRiotId(parsed.value);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lookup = await client.getAccount(parsed.value.name, parsed.value.tag);
  if (!lookup.ok) {
    context.logger.warn({ err: lookup.error, riotId }, 'riot account lookup failed');
    await replyEphemeral(interaction, describeLookupFailure(lookup.error, riotId, strings));
    return;
  }

  const account: Account = lookup.value;
  const existing = context.riotAccounts.findByPuuid(account.puuid);

  // The puuid column is unique, so a second claim would otherwise fail on the
  // index with nothing useful to say about it.
  if (existing !== undefined && existing.discordUserId !== interaction.user.id) {
    await replyEphemeral(interaction, strings.riotAccountTaken(riotId, existing.discordUserId));
    return;
  }

  context.riotAccounts.link(
    {
      discordUserId: interaction.user.id,
      puuid: account.puuid,
      riotName: account.name,
      riotTag: account.tag,
      region: account.region,
    },
    context.now().epochMilliseconds,
  );

  await replyEphemeral(
    interaction,
    strings.riotAccountLinked({
      riotId: formatRiotId({ name: account.name, tag: account.tag }),
      region: account.region,
      puuid: account.puuid,
      linkedAt: time(new Date(context.now().epochMilliseconds), TimestampStyles.ShortDate),
    }),
    cardArtwork(context, account.card),
  );
};

const handleShow = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
  strings: Strings,
): Promise<void> => {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const account = context.riotAccounts.find(target.id);

  if (account === undefined) {
    await replyEphemeral(
      interaction,
      target.id === interaction.user.id
        ? strings.riotAccountNotLinked
        : strings.riotAccountNotLinkedOther(target.id),
    );
    return;
  }

  await replyEphemeral(interaction, strings.riotAccountShown(target.id, partsFor(account)));
};

const handleRefresh = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
  client: ValorantClient,
  strings: Strings,
): Promise<void> => {
  const account = context.riotAccounts.find(interaction.user.id);
  if (account === undefined) {
    await replyEphemeral(interaction, strings.riotAccountNotLinked);
    return;
  }

  const riotId = formatRiotId({ name: account.riotName, tag: account.riotTag });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Looked up by puuid rather than by name: that is the whole point of storing it,
  // since the name and tag may already be someone else's by now.
  const lookup = await client.getAccountByPuuid(account.puuid);
  if (!lookup.ok) {
    context.logger.warn({ err: lookup.error, puuid: account.puuid }, 'riot account refresh failed');
    await replyEphemeral(interaction, describeLookupFailure(lookup.error, riotId, strings));
    return;
  }

  const fresh = lookup.value;
  const unchanged =
    fresh.name === account.riotName &&
    fresh.tag === account.riotTag &&
    fresh.region === account.region;

  if (unchanged) {
    await replyEphemeral(
      interaction,
      strings.riotAccountUnchanged(partsFor(account)),
      // Read again just now, so the card is current even when the name is not
      // what changed — a member who only reskinned their profile sees that.
      cardArtwork(context, fresh.card),
    );
    return;
  }

  context.riotAccounts.refreshIdentity(
    account.puuid,
    fresh.name,
    fresh.tag,
    fresh.region,
    context.now().epochMilliseconds,
  );

  await replyEphemeral(
    interaction,
    strings.riotAccountRefreshed({
      riotId: formatRiotId({ name: fresh.name, tag: fresh.tag }),
      region: fresh.region,
      puuid: account.puuid,
      linkedAt: partsFor(account).linkedAt,
    }),
    cardArtwork(context, fresh.card),
  );
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> => {
  const strings = stringsFor(resolveLocale(interaction.locale));

  if (!interaction.inGuild()) {
    await replyEphemeral(interaction, strings.guildOnly);
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'show') {
    await handleShow(interaction, context, strings);
    return;
  }

  if (subcommand === 'unlink') {
    const removed = context.riotAccounts.unlink(interaction.user.id);
    await replyEphemeral(
      interaction,
      removed ? strings.riotAccountUnlinked : strings.riotAccountNotLinked,
    );
    return;
  }

  // Everything past here talks to the API, which a deployment may not have a key for.
  const client = context.valorant;
  if (client === null) {
    await replyEphemeral(interaction, strings.valorantNotConfigured);
    return;
  }

  if (subcommand === 'link') {
    await handleLink(interaction, context, client, strings);
    return;
  }

  await handleRefresh(interaction, context, client, strings);
};

export const valoAccountCommand: SlashCommand = {
  name: 'valo-account',
  definition: definition.toJSON(),
  execute,
};
