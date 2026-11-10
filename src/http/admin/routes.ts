import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '../../db/database.ts';
import type {
  AdminSession,
  AdminSessionRepository,
} from '../../db/repositories/adminSessionRepository.ts';
import type { GuildSettingsRepository } from '../../db/repositories/guildSettingsRepository.ts';
import type { SteamWatchRepository } from '../../db/repositories/steamWatchRepository.ts';
import type { GuildDirectory } from '../../discord/guildDirectory.ts';
import { PICKUP_CHOICES } from '../../domain/pickupChoice.ts';
import { verifyPassword } from '../../lib/password.ts';
import type { Logger } from '../../logger.ts';
import { type AppLocale, resolveLocale } from '../../ui/strings.ts';
import type { HttpRequest, HttpResponse, HttpRoute } from '../types.ts';
import { parseCookies, serializeCookie } from './cookies.ts';
import { clientAddress, type LoginThrottle } from './loginThrottle.ts';
import { CONSOLE_CSP, guildPage, loginPage, messagePage, serverListPage } from './pages.ts';
import {
  ADMIN_BASE_PATH,
  GUILD_PATTERN,
  guildPath,
  INDEX_PATTERN,
  LOGIN_PATTERN,
  LOGOUT_PATTERN,
  loginPath,
  STEAM_WATCH_REMOVE_PATTERN,
} from './paths.ts';
import { draftFromSettings, type EditableSettings, parseSettingsForm } from './settingsForm.ts';
import { type ConsoleStrings, consoleStringsFor } from './strings.ts';

export const SESSION_COOKIE = 'pickup_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminCredentials {
  readonly username: string;
  /** An scrypt hash as produced by `npm run hash-password`. */
  readonly passwordHash: string;
}

export interface AdminConsoleDeps {
  readonly db: DatabaseSync;
  readonly settings: GuildSettingsRepository;
  readonly steamWatches: SteamWatchRepository;
  readonly sessions: AdminSessionRepository;
  readonly directory: GuildDirectory;
  readonly credentials: AdminCredentials;
  /** The public origin, e.g. `https://e.cthia.net`. Forms must come from it. */
  readonly publicBaseUrl: string;
  readonly throttle: LoginThrottle;
  readonly logger: Logger;
  readonly now: () => number;
}

const BASE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'same-origin',
};

const html = (
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): HttpResponse => ({
  status,
  headers: {
    ...BASE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': CONSOLE_CSP,
    ...headers,
  },
  body,
});

/** 303 so a browser follows a form post with a plain GET, and a reload never re-posts. */
const redirect = (
  location: string,
  headers: Readonly<Record<string, string>> = {},
): HttpResponse => ({
  status: 303,
  headers: { ...BASE_HEADERS, Location: location, ...headers },
  body: '',
});

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Equal-length digests, so the comparison takes the same time whatever was typed. */
const sameText = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

const TIME_ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

interface Visitor {
  readonly locale: AppLocale;
  readonly strings: ConsoleStrings;
  readonly session: AdminSession | undefined;
}

export const adminConsoleRoutes = (deps: AdminConsoleDeps): readonly HttpRoute[] => {
  const origin = new URL(deps.publicBaseUrl).origin;
  const secure = origin.startsWith('https:');

  const sessionCookie = (value: string, maxAgeMs: number): string =>
    serializeCookie(SESSION_COOKIE, value, {
      path: ADMIN_BASE_PATH,
      maxAge: Math.floor(maxAgeMs / 1000),
      secure,
    });

  const visitor = (request: HttpRequest): Visitor => {
    const locale = resolveLocale(request.headers['accept-language']);
    const token = parseCookies(request.headers['cookie']).get(SESSION_COOKIE);
    return {
      locale,
      strings: consoleStringsFor(locale),
      session: token === undefined ? undefined : deps.sessions.find(sha256(token), deps.now()),
    };
  };

  /**
   * A form post has to come from the console itself. Browsers send `Origin` on
   * every post; `Referer` covers the odd one that strips it.
   */
  const fromThisSite = (request: HttpRequest): boolean => {
    const sentOrigin = request.headers['origin'];
    if (sentOrigin !== undefined) {
      return sentOrigin === origin;
    }
    return request.headers['referer']?.startsWith(`${origin}/`) === true;
  };

  const csrfValid = (form: URLSearchParams, session: AdminSession): boolean =>
    sameText(form.get('csrf') ?? '', session.csrfToken);

  const notFoundPage = (who: Visitor): HttpResponse =>
    html(
      404,
      messagePage({
        locale: who.locale,
        strings: who.strings,
        title: '404',
        message: who.strings.notFound,
      }),
    );

  const crossSitePage = (who: Visitor): HttpResponse =>
    html(
      403,
      messagePage({
        locale: who.locale,
        strings: who.strings,
        title: '403',
        message: who.strings.crossSite,
      }),
    );

  const writeSettings = (guildId: string, settings: EditableSettings): void => {
    withTransaction(deps.db, () => {
      deps.settings.setPickupChannel(guildId, settings.pickupChannelId);
      deps.settings.setMentionRole(guildId, settings.mentionRoleId);
      deps.settings.setCinemaChannel(guildId, settings.cinemaChannelId);
      deps.settings.setCinemaRole(guildId, settings.cinemaRoleId);
      deps.settings.setConfigRole(guildId, settings.configRoleId);
      deps.settings.setSteamWatchChannel(guildId, settings.steamWatchChannelId);
      deps.settings.setTimezone(guildId, settings.timezone);
      for (const choice of PICKUP_CHOICES) {
        deps.settings.setChoiceEmoji(guildId, choice, settings.emojis[choice]);
      }
    });
  };

  const logIn = async (request: HttpRequest, who: Visitor): Promise<HttpResponse> => {
    if (!fromThisSite(request)) {
      return crossSitePage(who);
    }

    const client = clientAddress(request.headers['x-forwarded-for'], request.remoteAddress);
    const form = new URLSearchParams(request.body);
    const username = form.get('username') ?? '';

    if (deps.throttle.isBlocked(client)) {
      deps.logger.warn({ client }, 'admin login throttled');
      return html(
        429,
        loginPage({
          locale: who.locale,
          strings: who.strings,
          username,
          error: who.strings.loginThrottled,
        }),
        { 'Retry-After': '900' },
      );
    }

    // Both checks always run, so a wrong username takes as long as a wrong password.
    const usernameOk = sameText(username, deps.credentials.username);
    const passwordOk = await verifyPassword(
      form.get('password') ?? '',
      deps.credentials.passwordHash,
    );

    if (!usernameOk || !passwordOk) {
      deps.throttle.recordFailure(client);
      deps.logger.warn({ client }, 'admin login failed');
      return html(
        401,
        loginPage({
          locale: who.locale,
          strings: who.strings,
          username,
          error: who.strings.loginFailed,
        }),
      );
    }

    deps.throttle.reset(client);
    const now = deps.now();
    deps.sessions.pruneExpired(now);

    const token = randomBytes(32).toString('base64url');
    deps.sessions.create({
      tokenHash: sha256(token),
      csrfToken: randomBytes(24).toString('base64url'),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    deps.logger.info({ client }, 'admin logged in');

    return redirect(`${ADMIN_BASE_PATH}/`, { 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS) });
  };

  const index: HttpRoute = {
    methods: ['GET', 'HEAD'],
    pattern: INDEX_PATTERN,
    handle: (_match, request) => {
      if (request.pathname !== `${ADMIN_BASE_PATH}/`) {
        return redirect(`${ADMIN_BASE_PATH}/`);
      }
      const who = visitor(request);
      if (who.session === undefined) {
        return redirect(loginPath());
      }
      return html(
        200,
        serverListPage({
          locale: who.locale,
          strings: who.strings,
          csrfToken: who.session.csrfToken,
          guilds: deps.directory.list(),
        }),
      );
    },
  };

  const login: HttpRoute = {
    methods: ['GET', 'HEAD', 'POST'],
    pattern: LOGIN_PATTERN,
    handle: (_match, request) => {
      const who = visitor(request);
      if (request.method === 'POST') {
        return logIn(request, who);
      }
      if (who.session !== undefined) {
        return redirect(`${ADMIN_BASE_PATH}/`);
      }
      return html(200, loginPage({ locale: who.locale, strings: who.strings }));
    },
  };

  const logout: HttpRoute = {
    methods: ['POST'],
    pattern: LOGOUT_PATTERN,
    handle: (_match, request) => {
      const who = visitor(request);
      if (who.session === undefined) {
        return redirect(loginPath(), { 'Set-Cookie': sessionCookie('', 0) });
      }
      if (!fromThisSite(request) || !csrfValid(new URLSearchParams(request.body), who.session)) {
        return crossSitePage(who);
      }
      deps.sessions.remove(who.session.tokenHash);
      deps.logger.info('admin logged out');
      return redirect(loginPath(), { 'Set-Cookie': sessionCookie('', 0) });
    },
  };

  const guild: HttpRoute = {
    methods: ['GET', 'HEAD', 'POST'],
    pattern: GUILD_PATTERN,
    handle: (match, request) => {
      const who = visitor(request);
      const session = who.session;
      if (session === undefined) {
        return redirect(loginPath());
      }

      const guildId = match[1] ?? '';
      const detail = deps.directory.find(guildId);
      if (detail === null) {
        return notFoundPage(who);
      }

      const current = deps.settings.get(guildId);
      const formatter = new Intl.DateTimeFormat(who.locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: current.timezone,
      });
      const page = (
        overrides: Pick<Parameters<typeof guildPage>[0], 'draft' | 'problems'> & {
          notice?: 'saved' | 'watchRemoved';
        },
      ): string =>
        guildPage({
          locale: who.locale,
          strings: who.strings,
          csrfToken: session.csrfToken,
          guild: detail,
          watches: deps.steamWatches.listByGuild(guildId),
          timeZones: TIME_ZONES,
          formatDate: (epochMilliseconds) => formatter.format(epochMilliseconds),
          ...overrides,
        });

      if (request.method !== 'POST') {
        const saved = request.query.get('saved') === '1';
        const removed = request.query.get('removed') === '1';
        return html(
          200,
          page({
            draft: draftFromSettings(current),
            problems: new Map(),
            ...(saved ? { notice: 'saved' } : removed ? { notice: 'watchRemoved' } : {}),
          }),
        );
      }

      const form = new URLSearchParams(request.body);
      if (!fromThisSite(request) || !csrfValid(form, session)) {
        return crossSitePage(who);
      }

      const parsed = parseSettingsForm(form, detail, current);
      if (!parsed.ok) {
        return html(400, page({ draft: parsed.draft, problems: parsed.problems }));
      }

      writeSettings(guildId, parsed.settings);
      deps.logger.info({ guildId, settings: parsed.settings }, 'settings changed in web console');
      return redirect(`${guildPath(guildId)}?saved=1`);
    },
  };

  const removeSteamWatch: HttpRoute = {
    methods: ['POST'],
    pattern: STEAM_WATCH_REMOVE_PATTERN,
    handle: (match, request) => {
      const who = visitor(request);
      if (who.session === undefined) {
        return redirect(loginPath());
      }
      if (!fromThisSite(request) || !csrfValid(new URLSearchParams(request.body), who.session)) {
        return crossSitePage(who);
      }

      const guildId = match[1] ?? '';
      if (deps.directory.find(guildId) === null) {
        return notFoundPage(who);
      }

      const watchId = Number(match[2]);
      if (deps.steamWatches.removeForGuild(guildId, watchId)) {
        deps.logger.info({ guildId, watchId }, 'steam watch removed in web console');
      }
      return redirect(`${guildPath(guildId)}?removed=1`);
    },
  };

  return [index, login, logout, guild, removeSteamWatch];
};
