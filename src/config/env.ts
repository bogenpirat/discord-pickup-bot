import { z } from 'zod';
import { isPasswordHash } from '../lib/password.ts';

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
  // Key for the HenrikDev Valorant API (https://api.henrikdev.xyz). Blank or absent
  // turns every Valorant command off rather than failing at boot, so the bot still
  // runs its pickup duties on a deployment that has no key.
  VALORANT_API_KEY: z.string().min(1).optional(),
  // Requests per minute the key above is allowed. A basic key is limited to 30.
  VALORANT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(30),
  // First path segment of the API playground, served at
  // `<PUBLIC_BASE_URL>/<secret>/valorant-playground`. Blank or absent serves no
  // playground at all. The URL is the only thing guarding it, so a short value is
  // rejected rather than quietly accepted.
  VALORANT_PLAYGROUND_SECRET: z
    .string()
    .min(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'must be url-safe: letters, digits, dot-free, - or _')
    .optional(),
  // Key for the wardogserverlist.com API, made on the site's account page. The
  // site refuses server lookups without one from 7 Nov 2026, so blank or absent
  // leaves /wd answering that the site is not responding.
  WARDOGS_API_KEY: z.string().min(1).optional(),
  // Login for the web console at `<PUBLIC_BASE_URL>/pickup/`. The console is
  // served only when a hash is set, and only alongside the HTTP server. The hash
  // comes from `npm run hash-password`; a plain password is refused so it never
  // sits in the env file.
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD_HASH: z
    .string()
    .refine(isPasswordHash, 'must be a hash from `npm run hash-password`, not a plain password')
    .optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Where to append the audit log, one JSON line per slash command or button
  // click. Blank or absent records nothing. Under Docker this points into a
  // bind-mounted directory so the record outlives the container.
  AUDIT_LOG_PATH: z.string().min(1).optional(),
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
