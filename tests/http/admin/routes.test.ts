import { beforeAll, describe, expect, it } from 'vitest';
import { createAdminSessionRepository } from '../../../src/db/repositories/adminSessionRepository.ts';
import type { DirectoryGuildDetail, GuildDirectory } from '../../../src/discord/guildDirectory.ts';
import { createLoginThrottle } from '../../../src/http/admin/loginThrottle.ts';
import { adminConsoleRoutes, SESSION_TTL_MS } from '../../../src/http/admin/routes.ts';
import { resolveRequest } from '../../../src/http/router.ts';
import { pickupCalendarRoute } from '../../../src/http/routes/pickupCalendar.ts';
import type { HttpResponse } from '../../../src/http/types.ts';
import { hashPassword } from '../../../src/lib/password.ts';
import { createTestContext, silentLogger } from '../../helpers/fakes.ts';

const BASE = 'https://e.cthia.net';
const USERNAME = 'julian';
const PASSWORD = 'correct horse battery staple';

const GUILD = '111111111111111111';
const GENERAL = '222222222222222221';
const NEWS = '222222222222222222';
const VALO_ROLE = '333333333333333331';
const KINO_ROLE = '333333333333333332';

const GUILD_DETAIL: DirectoryGuildDetail = {
  id: GUILD,
  name: 'Test <Guild>',
  iconUrl: null,
  channels: [
    { id: GENERAL, name: 'general', kind: 'text' },
    { id: NEWS, name: 'news', kind: 'announcement' },
  ],
  roles: [
    { id: VALO_ROLE, name: 'Valo' },
    { id: KINO_ROLE, name: 'Kino' },
  ],
};

const directory: GuildDirectory = {
  list: () => [GUILD_DETAIL],
  find: (guildId) => (guildId === GUILD ? GUILD_DETAIL : null),
};

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD, { cost: 2 ** 10, blockSize: 8, parallelization: 1 });
});

interface SendOptions {
  readonly body?: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly cookie?: string | null;
  readonly origin?: string | null;
  readonly client?: string;
}

const setup = (publicBaseUrl = BASE) => {
  const context = createTestContext();
  const sessions = createAdminSessionRepository(context.db);
  let now = Date.UTC(2026, 10, 10, 12, 0);
  const routes = adminConsoleRoutes({
    db: context.db,
    settings: context.settings,
    steamWatches: context.steamWatches,
    sessions,
    directory,
    credentials: { username: USERNAME, passwordHash },
    publicBaseUrl,
    throttle: createLoginThrottle({ maxFailures: 5, windowMs: 15 * 60 * 1000, now: () => now }),
    logger: silentLogger(),
    now: () => now,
  });

  let cookie: string | null = null;

  const send = (method: string, path: string, options: SendOptions = {}): Promise<HttpResponse> => {
    const target = new URL(path, BASE);
    const sentCookie = options.cookie === undefined ? cookie : options.cookie;
    const origin = options.origin === undefined ? new URL(publicBaseUrl).origin : options.origin;
    return resolveRequest(
      {
        method,
        pathname: target.pathname,
        query: target.searchParams,
        headers: {
          ...(sentCookie === null ? {} : { cookie: sentCookie }),
          ...(method === 'POST' && origin !== null ? { origin } : {}),
          'x-forwarded-for': options.client ?? '203.0.113.9',
          ...options.headers,
        },
        body: new URLSearchParams(options.body ?? {}).toString(),
        remoteAddress: '172.18.0.2',
      },
      routes,
    );
  };

  const logIn = async (): Promise<string> => {
    const response = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
    });
    cookie = (response.headers['Set-Cookie'] ?? '').split(';')[0] ?? null;
    const page = await send('GET', '/pickup/');
    return /name="csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
  };

  return {
    context,
    sessions,
    send,
    logIn,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const fullForm = (
  csrf: string,
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  csrf,
  mention_role: VALO_ROLE,
  pickup_channel: GENERAL,
  cinema_role: KINO_ROLE,
  cinema_channel: NEWS,
  emoji_in: '🔥',
  emoji_later: '',
  emoji_out: '💀',
  timezone: 'Europe/Vienna',
  config_role: '',
  steam_channel: NEWS,
  ...overrides,
});

describe('signing in', () => {
  it('sends a visitor without a session to the login page', async () => {
    const { send } = setup();

    const response = await send('GET', '/pickup/');

    expect(response.status).toBe(303);
    expect(response.headers['Location']).toBe('/pickup/login');
  });

  it('adds the trailing slash to the bare prefix', async () => {
    const { send } = setup();

    expect((await send('GET', '/pickup')).headers['Location']).toBe('/pickup/');
  });

  it('serves a locked-down login page', async () => {
    const { send } = setup();

    const response = await send('GET', '/pickup/login');

    expect(response.status).toBe(200);
    expect(response.body).toContain('<form class="card" method="post" action="/pickup/login">');
    expect(response.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(response.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['X-Frame-Options']).toBe('DENY');
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('answers HEAD like GET', async () => {
    const { send } = setup();

    expect((await send('HEAD', '/pickup/login')).status).toBe(200);
  });

  it('hands out a hardened session cookie for the right credentials', async () => {
    const { send } = setup();

    const response = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
    });

    expect(response.status).toBe(303);
    expect(response.headers['Location']).toBe('/pickup/');
    const cookie = response.headers['Set-Cookie'] ?? '';
    expect(cookie).toMatch(/^pickup_session=[A-Za-z0-9_-]{43}; /);
    expect(cookie).toContain('Path=/pickup');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
  });

  it('drops Secure when the console is served over plain http', async () => {
    const { send } = setup('http://localhost:18080');

    const response = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
    });

    expect(response.headers['Set-Cookie']).not.toContain('Secure');
  });

  it.each([
    ['a wrong password', USERNAME, 'nope'],
    ['a wrong username', 'admin', PASSWORD],
  ])('refuses %s without saying which part was wrong', async (_label, username, password) => {
    const { send } = setup();

    const response = await send('POST', '/pickup/login', { body: { username, password } });

    expect(response.status).toBe(401);
    expect(response.headers['Set-Cookie']).toBeUndefined();
    expect(response.body).toContain('Benutzername oder Passwort stimmt nicht.');
    expect(response.body).toContain(`value="${username}"`);
  });

  it('refuses a login posted from another site', async () => {
    const { send } = setup();

    const response = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
      origin: 'https://evil.example',
    });

    expect(response.status).toBe(403);
    expect(response.headers['Set-Cookie']).toBeUndefined();
  });

  it('accepts a same-site Referer when the browser sent no Origin', async () => {
    const { send } = setup();

    const response = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
      origin: null,
      headers: { referer: `${BASE}/pickup/login` },
    });

    expect(response.status).toBe(303);
  });

  it('refuses a post that names no origin at all', async () => {
    const { send } = setup();

    const response = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
      origin: null,
    });

    expect(response.status).toBe(403);
  });

  it('locks a client out after five failures, even with the right password', async () => {
    const { send, advance } = setup();
    for (const _ of [1, 2, 3, 4, 5]) {
      await send('POST', '/pickup/login', { body: { username: USERNAME, password: 'nope' } });
    }

    const locked = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
    });
    expect(locked.status).toBe(429);
    expect(locked.headers['Retry-After']).toBe('900');
    expect(locked.body).toContain('Zu viele Fehlversuche');

    const otherClient = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
      client: '198.51.100.7',
    });
    expect(otherClient.status).toBe(303);

    advance(15 * 60 * 1000 + 1);
    const later = await send('POST', '/pickup/login', {
      body: { username: USERNAME, password: PASSWORD },
    });
    expect(later.status).toBe(303);
  });

  it('skips the login page for someone already signed in', async () => {
    const { send, logIn } = setup();
    await logIn();

    expect((await send('GET', '/pickup/login')).headers['Location']).toBe('/pickup/');
  });

  it('lets a session lapse after seven days', async () => {
    const { send, logIn, advance } = setup();
    await logIn();

    advance(SESSION_TTL_MS);

    expect((await send('GET', '/pickup/')).headers['Location']).toBe('/pickup/login');
  });

  it('ignores a cookie it never handed out', async () => {
    const { send } = setup();

    const response = await send('GET', '/pickup/', { cookie: 'pickup_session=forged' });

    expect(response.headers['Location']).toBe('/pickup/login');
  });

  it('speaks english to an english browser', async () => {
    const { send } = setup();

    const response = await send('GET', '/pickup/login', {
      headers: { 'accept-language': 'en-GB,en;q=0.9,de;q=0.5' },
    });

    expect(response.body).toContain('<html lang="en">');
    expect(response.body).toContain('Sign in');
  });
});

describe('signing out', () => {
  it('ends the session and clears the cookie', async () => {
    const { send, logIn } = setup();
    const csrf = await logIn();

    const response = await send('POST', '/pickup/logout', { body: { csrf } });

    expect(response.status).toBe(303);
    expect(response.headers['Location']).toBe('/pickup/login');
    expect(response.headers['Set-Cookie']).toContain('Max-Age=0');
    expect((await send('GET', '/pickup/')).headers['Location']).toBe('/pickup/login');
  });

  it('refuses a sign-out without the form token', async () => {
    const { send, logIn } = setup();
    await logIn();

    expect((await send('POST', '/pickup/logout', { body: {} })).status).toBe(403);
    expect((await send('GET', '/pickup/')).status).toBe(200);
  });

  it('just clears the cookie when there was no session', async () => {
    const { send } = setup();

    const response = await send('POST', '/pickup/logout', { body: {} });

    expect(response.headers['Location']).toBe('/pickup/login');
    expect(response.headers['Set-Cookie']).toContain('Max-Age=0');
  });
});

describe('the server list', () => {
  it('lists the servers the bot is in, escaped', async () => {
    const { send, logIn } = setup();
    await logIn();

    const response = await send('GET', '/pickup/');

    expect(response.status).toBe(200);
    expect(response.body).toContain(`href="/pickup/guilds/${GUILD}"`);
    expect(response.body).toContain('Test &lt;Guild&gt;');
    expect(response.body).not.toContain('Test <Guild>');
  });
});

describe('the settings form', () => {
  it('shows what is stored right now', async () => {
    const { send, logIn, context } = setup();
    context.settings.setCinemaRole(GUILD, KINO_ROLE);
    context.settings.setChoiceEmoji(GUILD, 'out', '💀');
    await logIn();

    const response = await send('GET', `/pickup/guilds/${GUILD}`);

    expect(response.status).toBe(200);
    expect(response.body).toContain(`<option value="${KINO_ROLE}" selected>@Kino</option>`);
    expect(response.body).toContain('name="emoji_out" maxlength="64" placeholder="❌" value="💀"');
    expect(response.body).toContain('value="Europe/Berlin"');
    expect(response.body).toContain('#news (Ankündigungen)');
  });

  it('answers 404 for a server the bot is not in', async () => {
    const { send, logIn } = setup();
    await logIn();

    expect((await send('GET', '/pickup/guilds/999999999999999999')).status).toBe(404);
  });

  it('sends a visitor without a session to log in', async () => {
    const { send } = setup();

    expect((await send('GET', `/pickup/guilds/${GUILD}`)).headers['Location']).toBe(
      '/pickup/login',
    );
    expect((await send('POST', `/pickup/guilds/${GUILD}`)).headers['Location']).toBe(
      '/pickup/login',
    );
  });

  it('saves every field and says so', async () => {
    const { send, logIn, context } = setup();
    const csrf = await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}`, { body: fullForm(csrf) });

    expect(response.status).toBe(303);
    expect(response.headers['Location']).toBe(`/pickup/guilds/${GUILD}?saved=1`);
    expect(context.settings.get(GUILD)).toEqual({
      guildId: GUILD,
      pickupChannelId: GENERAL,
      mentionRoleId: VALO_ROLE,
      configRoleId: null,
      emojis: { in: '🔥', later: null, out: '💀' },
      timezone: 'Europe/Vienna',
      steamWatchChannelId: NEWS,
      cinemaChannelId: NEWS,
      cinemaRoleId: KINO_ROLE,
    });

    const after = await send('GET', `/pickup/guilds/${GUILD}?saved=1`);
    expect(after.body).toContain('Gespeichert.');
  });

  it('clears a setting chosen as none', async () => {
    const { send, logIn, context } = setup();
    context.settings.setMentionRole(GUILD, VALO_ROLE);
    const csrf = await logIn();

    await send('POST', `/pickup/guilds/${GUILD}`, { body: fullForm(csrf, { mention_role: '' }) });

    expect(context.settings.get(GUILD).mentionRoleId).toBeNull();
  });

  it('keeps a stored channel Discord no longer knows', async () => {
    const { send, logIn, context } = setup();
    const gone = '222222222222222229';
    context.settings.setPickupChannel(GUILD, gone);
    const csrf = await logIn();

    const page = await send('GET', `/pickup/guilds/${GUILD}`);
    expect(page.body).toContain(
      `<option value="${gone}" selected>⚠ nicht mehr vorhanden (${gone})`,
    );

    const saved = await send('POST', `/pickup/guilds/${GUILD}`, {
      body: fullForm(csrf, { pickup_channel: gone }),
    });
    expect(saved.status).toBe(303);
    expect(context.settings.get(GUILD).pickupChannelId).toBe(gone);
  });

  it('saves nothing and marks every bad field', async () => {
    const { send, logIn, context } = setup();
    const csrf = await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}`, {
      body: fullForm(csrf, {
        pickup_channel: '222222222222222229',
        config_role: '333333333333333339',
        emoji_in: 'fire',
        timezone: 'Mars/Olympus',
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body).toContain('Nichts gespeichert');
    expect(response.body).toContain('Diesen Kanal gibt es auf dem Server nicht.');
    expect(response.body).toContain('Diese Rolle gibt es auf dem Server nicht.');
    expect(response.body).toContain('Das sieht nicht nach einem Emoji aus.');
    expect(response.body).toContain('Unbekannte Zeitzone');
    expect(response.body).toContain(
      'value="Mars/Olympus" aria-describedby="timezone-hint timezone-error" aria-invalid="true"',
    );
    expect(context.settings.get(GUILD).mentionRoleId).toBeNull();
  });

  it('refuses a save without the form token', async () => {
    const { send, logIn, context } = setup();
    await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}`, {
      body: fullForm('forged'),
    });

    expect(response.status).toBe(403);
    expect(context.settings.get(GUILD).mentionRoleId).toBeNull();
  });

  it('refuses a save posted from another site, token or not', async () => {
    const { send, logIn, context } = setup();
    const csrf = await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}`, {
      body: fullForm(csrf),
      origin: 'https://evil.example',
    });

    expect(response.status).toBe(403);
    expect(context.settings.get(GUILD).mentionRoleId).toBeNull();
  });

  it('answers 404 when saving a server the bot is not in', async () => {
    const { send, logIn } = setup();
    const csrf = await logIn();

    const response = await send('POST', '/pickup/guilds/999999999999999999', {
      body: fullForm(csrf),
    });

    expect(response.status).toBe(404);
  });
});

describe('steam watches', () => {
  const watch = (context: ReturnType<typeof setup>['context'], overrides = {}) =>
    context.steamWatches.create({
      guildId: GUILD,
      channelId: NEWS,
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'ELDEN <RING>',
      status: 'scheduled',
      releaseDate: Date.UTC(2027, 1, 25, 15, 0),
      releaseDateText: null,
      nextCheckAt: 0,
      ...overrides,
    });

  it('lists the watched games with their dates', async () => {
    const { send, logIn, context } = setup();
    watch(context);
    watch(context, {
      appId: 1,
      messageId: 'message-2',
      gameName: 'Someday',
      status: 'pending',
      releaseDate: null,
      releaseDateText: 'Coming soon',
    });
    watch(context, {
      appId: 2,
      messageId: 'message-3',
      gameName: 'Unknown',
      status: 'pending',
      releaseDate: null,
    });
    await logIn();

    const page = (await send('GET', `/pickup/guilds/${GUILD}`)).body;

    expect(page).toContain('ELDEN &lt;RING&gt;');
    expect(page).toContain('25.02.2027, 16:00');
    expect(page).toContain('Coming soon');
    expect(page).toContain('noch kein Datum bekannt');
  });

  it('says so when nothing is watched', async () => {
    const { send, logIn } = setup();
    await logIn();

    expect((await send('GET', `/pickup/guilds/${GUILD}`)).body).toContain(
      'Gerade wird kein Spiel beobachtet.',
    );
  });

  it('removes a watch', async () => {
    const { send, logIn, context } = setup();
    const id = watch(context);
    const csrf = await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}/steam-watches/${id}/remove`, {
      body: { csrf },
    });

    expect(response.headers['Location']).toBe(`/pickup/guilds/${GUILD}?removed=1`);
    expect(context.steamWatches.listByGuild(GUILD)).toHaveLength(0);
    expect((await send('GET', `/pickup/guilds/${GUILD}?removed=1`)).body).toContain(
      'Das Spiel wird nicht mehr beobachtet.',
    );
  });

  it('refuses a removal without the form token', async () => {
    const { send, logIn, context } = setup();
    const id = watch(context);
    await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}/steam-watches/${id}/remove`, {
      body: {},
    });

    expect(response.status).toBe(403);
    expect(context.steamWatches.listByGuild(GUILD)).toHaveLength(1);
  });

  it('sends a visitor without a session to log in', async () => {
    const { send } = setup();

    const response = await send('POST', `/pickup/guilds/${GUILD}/steam-watches/1/remove`);

    expect(response.headers['Location']).toBe('/pickup/login');
  });

  it('answers 404 for a server the bot is not in', async () => {
    const { send, logIn } = setup();
    const csrf = await logIn();

    const response = await send(
      'POST',
      '/pickup/guilds/999999999999999999/steam-watches/1/remove',
      {
        body: { csrf },
      },
    );

    expect(response.status).toBe(404);
  });

  it('shrugs at a watch that is already gone', async () => {
    const { send, logIn } = setup();
    const csrf = await logIn();

    const response = await send('POST', `/pickup/guilds/${GUILD}/steam-watches/42/remove`, {
      body: { csrf },
    });

    expect(response.status).toBe(303);
  });
});

describe('what stays public', () => {
  it('serves a calendar download to anyone, with the console mounted next to it', async () => {
    const context = createTestContext();
    const id = context.pickups.create({
      guildId: GUILD,
      channelId: GENERAL,
      theme: 'game',
      creatorId: 'creator-1',
      startsAt: Date.UTC(2026, 10, 11, 19, 0),
      startsAtText: null,
      note: null,
    });
    context.pickups.attachMessage(id, 'message-1');

    // Built the way src/index.ts builds it: public routes first, the console last.
    const routes = [
      pickupCalendarRoute({
        pickups: context.pickups,
        guildName: () => 'Test Guild',
        baseUrl: BASE,
        now: Date.now,
      }),
      ...adminConsoleRoutes({
        db: context.db,
        settings: context.settings,
        steamWatches: context.steamWatches,
        sessions: createAdminSessionRepository(context.db),
        directory,
        credentials: { username: USERNAME, passwordHash },
        publicBaseUrl: BASE,
        throttle: createLoginThrottle({ maxFailures: 5, windowMs: 1000, now: Date.now }),
        logger: silentLogger(),
        now: Date.now,
      }),
    ];

    const response = await resolveRequest(
      {
        method: 'GET',
        pathname: `/pickup/calendar/${id}.ics`,
        query: new URLSearchParams('lang=de'),
        headers: {},
        body: '',
        remoteAddress: '172.18.0.2',
      },
      routes,
    );

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(response.body).toContain('BEGIN:VCALENDAR');
    expect(response.headers['Location']).toBeUndefined();
  });

  it.each(['/pickup/calendar/1.ics', '/pickup/wardogs/join/91052133-1e18-4af8-b54e-499ab279f446'])(
    'claims none of the public path %s',
    async (path) => {
      // With only the console mounted, a public path must fall through to a plain
      // 404 rather than being answered with a redirect to the login page.
      const { send } = setup();

      const response = await send('GET', path, { cookie: null });

      expect(response.status).toBe(404);
      expect(response.headers['Location']).toBeUndefined();
    },
  );
});
