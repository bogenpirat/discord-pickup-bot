import { Client, GatewayIntentBits, Options } from 'discord.js';

export const createClient = (): Client =>
  new Client({
    intents: [GatewayIntentBits.Guilds],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 0,
      GuildMemberManager: 0,
    }),
  });
