import type { Message } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { extractSteamAppIds } from '../domain/steam/extractAppIds.ts';
import type { SteamClient } from '../steam/client.ts';
import { recordDetectedGame } from '../steam/watchService.ts';

const WATCHING_REACTION = '👀';

export const createSteamLinkListener =
  (context: AppContext, steamClient: SteamClient) =>
  async (message: Message): Promise<void> => {
    if (message.author.bot || !message.inGuild()) {
      return;
    }

    const settings = context.settings.get(message.guildId);
    if (
      settings.steamWatchChannelId === null ||
      message.channelId !== settings.steamWatchChannelId
    ) {
      return;
    }

    const appIds = extractSteamAppIds(message.content);
    let startedWatching = false;

    for (const appId of appIds) {
      const started = await context.mutex.runExclusive(
        `steam-watch:${message.guildId}:${appId}`,
        () =>
          recordDetectedGame(context, steamClient, {
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: message.id,
            appId,
          }),
      );
      startedWatching ||= started;
    }

    if (startedWatching) {
      try {
        await message.react(WATCHING_REACTION);
      } catch (error) {
        context.logger.warn(
          { err: error, messageId: message.id },
          'failed to react to steam link message',
        );
      }
    }
  };
