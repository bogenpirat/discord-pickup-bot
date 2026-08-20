import type { Client } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { SteamWatchRecord } from '../db/repositories/steamWatchRepository.ts';
import { classifyRelease } from '../domain/steam/classifyRelease.ts';
import type { SteamAppDetails } from '../domain/steam/parseAppDetails.ts';
import { nextRetryCheck, nextWeeklyCheck, releaseDayInstant } from '../domain/steam/schedule.ts';
import { DEFAULT_TIME_ZONE } from '../domain/time/timezone.ts';
import { renderSteamReleaseMessage } from '../ui/steamAnnouncement.ts';
import type { SteamClient } from './client.ts';
import { describeWatch } from './watchLog.ts';

/** What one due-check concluded about a game, tallied into the tick summary. */
export type WatchCheckOutcome =
  | 'released'
  | 'announce-failed'
  | 'scheduled'
  | 'pending'
  | 'unavailable'
  | 'lookup-failed';

export interface DetectedGame {
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly appId: number;
}

const today = (context: AppContext): Temporal.PlainDate =>
  context.now().toZonedDateTimeISO(DEFAULT_TIME_ZONE).toPlainDate();

/**
 * Returns whether a watch was newly created, so the caller can react to the
 * source message only when the bot actually starts watching the game.
 */
export const recordDetectedGame = async (
  context: AppContext,
  steamClient: SteamClient,
  input: DetectedGame,
): Promise<boolean> => {
  if (context.steamWatches.findByGuildAndApp(input.guildId, input.appId) !== undefined) {
    context.logger.debug(
      { guildId: input.guildId, appId: input.appId },
      'steam app already watched, ignoring link',
    );
    return false;
  }

  const lookup = await steamClient.getAppDetails(input.appId);

  if (lookup.kind === 'error') {
    context.steamWatches.create({
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      appId: input.appId,
      gameName: `Steam App ${input.appId}`,
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: nextRetryCheck(context.now()).epochMilliseconds,
    });
    context.logger.info(
      { guildId: input.guildId, appId: input.appId },
      'steam lookup failed while adding a watch, retrying in an hour',
    );
    return true;
  }

  if (lookup.kind === 'invalid') {
    context.logger.debug(
      { guildId: input.guildId, appId: input.appId },
      'steam app id is unknown, not watching',
    );
    return false;
  }

  const classification = classifyRelease(
    lookup.details.comingSoon,
    lookup.details.releaseDateText,
    today(context),
  );
  if (classification.kind === 'released') {
    context.logger.debug(
      { guildId: input.guildId, appId: input.appId, game: lookup.details.name },
      'steam app is already released, not watching',
    );
    return false;
  }

  const nextCheckAt =
    classification.kind === 'pending'
      ? nextWeeklyCheck(context.now())
      : releaseDayInstant(classification.date);

  context.steamWatches.create({
    guildId: input.guildId,
    channelId: input.channelId,
    messageId: input.messageId,
    appId: input.appId,
    gameName: lookup.details.name,
    status: classification.kind === 'pending' ? 'pending' : 'scheduled',
    releaseDate:
      classification.kind === 'scheduled'
        ? releaseDayInstant(classification.date).epochMilliseconds
        : null,
    releaseDateText: lookup.details.releaseDateText,
    nextCheckAt: nextCheckAt.epochMilliseconds,
  });
  context.logger.info(
    {
      guildId: input.guildId,
      appId: input.appId,
      game: lookup.details.name,
      status: classification.kind,
      releaseDateText: lookup.details.releaseDateText,
      nextCheckAt: nextCheckAt.toString(),
    },
    'now watching steam game for release',
  );
  return true;
};

const retryAnnounceLater = (context: AppContext, row: SteamWatchRecord): void => {
  context.steamWatches.reschedule(row.id, {
    status: row.status,
    releaseDate: row.releaseDate,
    releaseDateText: row.releaseDateText,
    nextCheckAt: nextRetryCheck(context.now()).epochMilliseconds,
  });
};

const announceRelease = async (
  context: AppContext,
  discordClient: Client,
  row: SteamWatchRecord,
  details: SteamAppDetails,
): Promise<boolean> => {
  const channel = await discordClient.channels.fetch(row.channelId).catch(() => null);
  if (channel === null || !channel.isTextBased() || !channel.isSendable()) {
    context.logger.warn(
      { ...describeWatch(row), channelId: row.channelId },
      'steam watch channel unavailable, retrying later',
    );
    retryAnnounceLater(context, row);
    return false;
  }

  try {
    await channel.send({
      ...renderSteamReleaseMessage(details),
      reply: { messageReference: row.messageId, failIfNotExists: false },
    });
    context.steamWatches.remove(row.id);
    context.logger.info(
      { ...describeWatch(row), game: details.name, channelId: row.channelId },
      'steam game released, announced in channel and stopped watching',
    );
    return true;
  } catch (error) {
    context.logger.error(
      { err: error, ...describeWatch(row), game: details.name },
      'failed to send steam release announcement, retrying later',
    );
    retryAnnounceLater(context, row);
    return false;
  }
};

export const processDueWatch = async (
  context: AppContext,
  steamClient: SteamClient,
  discordClient: Client,
  row: SteamWatchRecord,
): Promise<WatchCheckOutcome> => {
  const lookup = await steamClient.getAppDetails(row.appId);

  if (lookup.kind === 'error') {
    context.logger.warn(describeWatch(row), 'steam lookup failed, keeping the existing schedule');
    return 'lookup-failed';
  }

  if (lookup.kind === 'invalid') {
    context.steamWatches.remove(row.id);
    context.logger.warn(describeWatch(row), 'steam app no longer available, stopped watching');
    return 'unavailable';
  }

  const classification = classifyRelease(
    lookup.details.comingSoon,
    lookup.details.releaseDateText,
    today(context),
  );

  if (classification.kind === 'released') {
    const announced = await announceRelease(context, discordClient, row, lookup.details);
    return announced ? 'released' : 'announce-failed';
  }

  const nextCheckAt =
    classification.kind === 'pending'
      ? nextWeeklyCheck(context.now())
      : releaseDayInstant(classification.date);

  context.steamWatches.reschedule(row.id, {
    status: classification.kind === 'pending' ? 'pending' : 'scheduled',
    gameName: lookup.details.name,
    releaseDate:
      classification.kind === 'scheduled'
        ? releaseDayInstant(classification.date).epochMilliseconds
        : null,
    releaseDateText: lookup.details.releaseDateText,
    nextCheckAt: nextCheckAt.epochMilliseconds,
  });

  context.logger.info(
    {
      watchId: row.id,
      guildId: row.guildId,
      appId: row.appId,
      game: lookup.details.name,
      status: classification.kind,
      releaseDateText: lookup.details.releaseDateText,
      nextCheckAt: nextCheckAt.toString(),
    },
    classification.kind === 'scheduled'
      ? 'steam game still unreleased, release date known'
      : 'steam game still unreleased, no release date yet',
  );

  return classification.kind === 'scheduled' ? 'scheduled' : 'pending';
};
