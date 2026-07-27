import { REST, Routes } from 'discord.js';
import { COMMANDS } from '../app/registries.ts';
import { loadEnv } from '../config/env.ts';
import { createLogger } from '../logger.ts';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV !== 'production');
const rest = new REST().setToken(env.DISCORD_TOKEN);
const body = COMMANDS.map((command) => command.definition);

const route =
  env.DISCORD_DEV_GUILD_ID === undefined
    ? Routes.applicationCommands(env.DISCORD_APP_ID)
    : Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_DEV_GUILD_ID);

await rest.put(route, { body });

logger.info(
  { count: body.length, scope: env.DISCORD_DEV_GUILD_ID ?? 'global' },
  'registered application commands',
);
