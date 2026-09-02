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
import { valorantPlaygroundRoute } from './http/routes/valorantPlayground.ts';
import { type RunningHttpServer, startHttpServer } from './http/server.ts';
import { createRateLimiter } from './lib/rateLimiter.ts';
import { createLogger } from './logger.ts';
import { createSteamClient } from './steam/client.ts';
import { startSteamWatchPoller } from './steam/poller.ts';
import { createValorantClient, type ValorantClient } from './valorant/client.ts';

const HEARTBEAT_INTERVAL_MS = 30_000;

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV !== 'production');

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const db = openDatabase(env.DATABASE_PATH);

// Without a key the bot still runs its pickup duties; the Valorant commands are
// registered either way and refuse at call time, because command registration
// happens in a separate process that has no access to this context.
const valorant: ValorantClient | null =
  env.VALORANT_API_KEY === undefined
    ? null
    : createValorantClient({
        apiKey: env.VALORANT_API_KEY,
        limiter: createRateLimiter({ limit: env.VALORANT_RATE_LIMIT_PER_MINUTE }),
      });

logger.info(
  valorant === null
    ? { enabled: false }
    : { enabled: true, requestsPerMinute: env.VALORANT_RATE_LIMIT_PER_MINUTE },
  'valorant api client',
);

const context = createAppContext(
  db,
  logger,
  env.POWER_USER_IDS,
  env.PUBLIC_BASE_URL ?? null,
  valorant,
);
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

  // One request, once, for names the API otherwise leaves as bare uuids. The
  // dump describes the game build, so it goes stale with a patch rather than
  // with a match, and re-reading it per command would spend the rate limit on
  // data that has not moved. Deliberately not awaited: nothing depends on it
  // being there, and a slow content call should not hold up the gateway.
  void context.content.load();

  // Started here rather than at boot: every value in a served calendar file comes
  // from SQLite except the guild name, which is read from a cache that stays empty
  // until the gateway handshake finishes. Binding a moment later costs a brief
  // connection refused and buys never serving a file with a half-built title.
  const baseUrl = env.PUBLIC_BASE_URL;

  if (baseUrl !== undefined) {
    // The playground needs both a client to drive and a secret to hide behind;
    // without either it is simply not part of the route table, so its path 404s
    // exactly like any other unclaimed one.
    const playgroundSecret = env.VALORANT_PLAYGROUND_SECRET;
    const playground =
      valorant === null || playgroundSecret === undefined
        ? []
        : [
            valorantPlaygroundRoute({
              client: valorant,
              content: context.content,
              secret: playgroundSecret,
              logger,
            }),
          ];

    if (playground.length > 0) {
      logger.info(
        { url: `${baseUrl}/pickup/${playgroundSecret}/valorant-playground` },
        'valorant api playground served',
      );
    }

    httpServer = startHttpServer({
      port: env.HTTP_PORT,
      routes: [
        pickupCalendarRoute({
          pickups: context.pickups,
          guildName: (guildId) => client.guilds.cache.get(guildId)?.name ?? null,
          baseUrl,
          now: Date.now,
        }),
        ...playground,
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
