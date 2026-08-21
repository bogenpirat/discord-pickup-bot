import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  DISCORD_DEV_GUILD_ID: z.string().min(1).optional(),
  POWER_USER_IDS: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? []
        : value
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id !== ''),
    ),
  DATABASE_PATH: z.string().min(1).default('./data/pickup.db'),
  // Public origin of the bot's HTTP server, e.g. http://pickup.example.net:18080.
  // Blank or absent turns the server off entirely, along with the iCal button.
  // The protocol is pinned because `pickup.example.net:18080` otherwise parses as
  // a URL with a scheme of `pickup.example.net:`, and a missing `http://` would
  // reach members as a dead button rather than a startup error.
  PUBLIC_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, ''))
    .optional(),
  HTTP_PORT: z.coerce.number().int().min(10000).max(65535).default(18080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HEARTBEAT_PATH: z.string().min(1).default('/tmp/heartbeat'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type Env = z.infer<typeof schema>;

const withoutBlanks = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = schema.safeParse(withoutBlanks(source));

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
};
