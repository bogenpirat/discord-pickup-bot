import type { Client } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import type { SteamWatchRecord } from '../db/repositories/steamWatchRepository.ts';
import { classifyRelease } from '../domain/steam/classifyRelease.ts';
import type { SteamAppDetails } from '../domain/steam/parseAppDetails.ts';
import { nextRetryCheck, nextWeeklyCheck, releaseDayInstant } from '../domain/steam/schedule.ts';
import { DEFAULT_TIME_ZONE } from '../domain/time/timezone.ts';
import { renderSteamReleaseMessage } from '../ui/steamAnnouncement.ts';
import type { SteamClient } from './client.ts';

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
    return true;
  }

  if (lookup.kind === 'invalid') {
    return false;
  }

  const classification = classifyRelease(
    lookup.details.comingSoon,
    lookup.details.releaseDateText,
    today(context),
  );
  if (classification.kind === 'released') {
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
): Promise<void> => {
  const channel = await discordClient.channels.fetch(row.channelId).catch(() => null);
  if (channel === null || !channel.isTextBased() || !channel.isSendable()) {
    context.logger.warn({ watchId: row.id }, 'steam watch channel unavailable, retrying later');
    retryAnnounceLater(context, row);
    return;
  }

  try {
    await channel.send({
      ...renderSteamReleaseMessage(details),
      reply: { messageReference: row.messageId, failIfNotExists: false },
    });
    context.steamWatches.remove(row.id);
  } catch (error) {
    context.logger.error(
      { err: error, watchId: row.id },
      'failed to send steam release announcement',
    );
    retryAnnounceLater(context, row);
  }
};

export const processDueWatch = async (
  context: AppContext,
  steamClient: SteamClient,
  discordClient: Client,
  row: SteamWatchRecord,
): Promise<void> => {
  const lookup = await steamClient.getAppDetails(row.appId);

  if (lookup.kind === 'error') {
    return;
  }

  if (lookup.kind === 'invalid') {
    context.steamWatches.remove(row.id);
    context.logger.warn({ watchId: row.id, appId: row.appId }, 'steam app no longer available');
    return;
  }

  const classification = classifyRelease(
    lookup.details.comingSoon,
    lookup.details.releaseDateText,
    today(context),
  );

  if (classification.kind === 'released') {
    await announceRelease(context, discordClient, row, lookup.details);
    return;
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
};
