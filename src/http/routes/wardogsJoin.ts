import { parseServerKey } from '../../domain/wardogs/serverKey.ts';
import type { Logger } from '../../logger.ts';
import {
  APP_LOCALES,
  type AppLocale,
  DEFAULT_LOCALE,
  type Strings,
  stringsFor,
} from '../../ui/strings.ts';
import {
  bannerUrl,
  serverPageUrl,
  type WardogsClient,
  type WardogsJoinResult,
} from '../../wardogs/client.ts';
import { notFound } from '../router.ts';
import type { HttpRoute } from '../types.ts';
import { JOIN_PAGE_CSP, type JoinPageOutcome, joinPage } from '../wardogsJoinPage.ts';

export interface WardogsJoinDeps {
  readonly wardogs: WardogsClient;
  readonly logger: Logger;
  /** Versions the status card when the details do not say when they were polled. */
  readonly now: () => number;
}

/**
 * `/pickup/wardogs/join/<guid>`: the target of the join button under `/wd`.
 * Discord only lets link buttons open http(s) URLs, so the button lands here and
 * this page hands the browser on to the `steam://joinlobby/…` link, with the
 * server's card and a button to click should the browser not follow on its own. The link is
 * asked for on each visit rather than when the message was posted, because the
 * lobby id changes whenever the server restarts.
 */
export const WARDOGS_JOIN_PATTERN = /^\/pickup\/wardogs\/join\/([0-9a-fA-F-]{36})$/;

export const wardogsJoinPath = (guid: string): string => `/pickup/wardogs/join/${guid}`;

const HTML_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': JOIN_PAGE_CSP,
  'Referrer-Policy': 'no-referrer',
};

const isAppLocale = (value: string): value is AppLocale =>
  (APP_LOCALES as readonly string[]).includes(value);

const localeFrom = (value: string | null): AppLocale =>
  value !== null && isAppLocale(value) ? value : DEFAULT_LOCALE;

const STATUS: Readonly<Record<WardogsJoinResult['kind'], number>> = {
  link: 200,
  'not-found': 404,
  'rate-limited': 429,
  invalid: 502,
  error: 502,
};

const outcomeOf = (result: WardogsJoinResult, strings: Strings): JoinPageOutcome => {
  switch (result.kind) {
    case 'link':
      return { kind: 'link', link: result.link };
    case 'not-found':
      return { kind: 'failed', message: strings.wdJoinUnavailable };
    case 'rate-limited':
      return { kind: 'failed', message: strings.wdRateLimited };
    case 'invalid':
    case 'error':
      return { kind: 'failed', message: strings.wdApiUnavailable };
  }
};

export const wardogsJoinRoute = (deps: WardogsJoinDeps): HttpRoute => ({
  methods: ['GET', 'HEAD'],
  pattern: WARDOGS_JOIN_PATTERN,
  handle: async (match, request) => {
    const key = parseServerKey(match[1] ?? '');
    if (key === null) {
      return notFound();
    }

    const locale = localeFrom(request.query.get('lang'));
    const strings = stringsFor(locale);
    // The details only dress the page up — name, players, the site's card — so
    // they are asked for alongside the link and simply left out when missing.
    const [result, detail] = await Promise.all([
      deps.wardogs.getJoinLink(key),
      deps.wardogs.getServerDetail(key),
    ]);
    const live = detail.kind === 'live' ? detail : null;

    if (result.kind === 'invalid' || result.kind === 'error') {
      deps.logger.warn({ result: result.kind, key }, 'wardogs join link lookup failed');
    }

    const linkKey = live?.linkKey ?? null;
    return {
      status: STATUS[result.kind],
      headers: HTML_HEADERS,
      body: joinPage({
        locale,
        strings,
        name: live?.server.name ?? (result.kind === 'link' ? result.name : null),
        server: live?.server ?? null,
        cardUrl:
          live === null || linkKey === null
            ? null
            : // Versioned like the `/wd` banner, by the poll the details came from.
              bannerUrl(
                linkKey,
                Math.floor((live.updatedAt?.epochMilliseconds ?? deps.now()) / 1000),
              ),
        // The site's pages take the `id|` key as well as their own slug.
        serverPageUrl: serverPageUrl(linkKey ?? key),
        outcome: outcomeOf(result, strings),
      }),
    };
  },
});
