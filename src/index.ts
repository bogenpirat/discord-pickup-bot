import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Events } from 'discord.js';
import { createAppContext } from './app/context.ts';
import { buildButtonRegistry, buildCommandRegistry } from './app/registries.ts';
import { loadEnv } from './config/env.ts';
import { openDatabase } from './db/database.ts';
import { createClient } from './discord/client.ts';
import { createSteamLinkListener } from './discord/steamLinkListener.ts';
import { pickupCalendarRoute } from './http/routes/pickupCalendar.ts';
import { type RunningHttpServer, startHttpServer } from './http/server.ts';
import { createLogger } from './logger.ts';
import { createSteamClient } from './steam/client.ts';
import { startSteamWatchPoller } from './steam/poller.ts';

const HEARTBEAT_INTERVAL_MS = 30_000;

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV !== 'production');

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const db = openDatabase(env.DATABASE_PATH);
const context = createAppContext(db, logger, env.POWER_USER_IDS, env.PUBLIC_BASE_URL ?? null);
const commands = buildCommandRegistry();
const buttons = buildButtonRegistry();
const client = createClient();
const steamClient = createSteamClient();
const steamPoller = startSteamWatchPoller(context, client, steamClient);

const beat = (): void => {
  try {
    writeFileSync(env.HEARTBEAT_PATH, String(Date.now()));
  } catch (error) {
    logger.warn({ err: error }, 'could not write heartbeat');
  }
};

let httpServer: RunningHttpServer | null = null;

client.once(Events.ClientReady, (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'logged in');
  beat();
  void steamPoller.runNow();

  // Started here rather than at boot: every value in a served calendar file comes
  // from SQLite except the guild name, which is read from a cache that stays empty
  // until the gateway handshake finishes. Binding a moment later costs a brief
  // connection refused and buys never serving a file with a half-built title.
  const baseUrl = env.PUBLIC_BASE_URL;

  if (baseUrl !== undefined) {
    httpServer = startHttpServer({
      port: env.HTTP_PORT,
      routes: [
        pickupCalendarRoute({
          pickups: context.pickups,
          guildName: (guildId) => client.guilds.cache.get(guildId)?.name ?? null,
          baseUrl,
          now: Date.now,
        }),
      ],
      logger,
    });
  }
});

const heartbeat = setInterval(beat, HEARTBEAT_INTERVAL_MS);
heartbeat.unref();

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await commands.dispatch(interaction, context);
    return;
  }
  if (interaction.isAutocomplete()) {
    await commands.dispatchAutocomplete(interaction, context);
    return;
  }
  if (interaction.isButton()) {
    await buttons.dispatch(interaction, context);
  }
});

client.on(Events.MessageCreate, createSteamLinkListener(context, steamClient));

client.on(Events.Error, (error) => {
  logger.error({ err: error }, 'discord client error');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutting down');
  clearInterval(heartbeat);
  steamPoller.stop();
  httpServer?.close();
  void client.destroy().finally(() => {
    db.close();
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

await client.login(env.DISCORD_TOKEN);
