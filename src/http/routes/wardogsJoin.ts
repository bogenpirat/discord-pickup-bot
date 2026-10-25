import { parseServerKey } from '../../domain/wardogs/serverKey.ts';
import type { Logger } from '../../logger.ts';
import { APP_LOCALES, type AppLocale, DEFAULT_LOCALE, stringsFor } from '../../ui/strings.ts';
import type { WardogsClient } from '../../wardogs/client.ts';
import { notFound } from '../router.ts';
import type { HttpResponse, HttpRoute } from '../types.ts';

export interface WardogsJoinDeps {
  readonly wardogs: WardogsClient;
  readonly logger: Logger;
}

/**
 * `/pickup/wardogs/join/<guid>`: the target of the join button under `/wd`.
 * Discord only lets link buttons open http(s) URLs, so the button lands here and
 * this page hands the browser on to the `steam://joinlobby/…` link. The link is
 * asked for on each visit rather than when the message was posted, because the
 * lobby id changes whenever the server restarts.
 */
export const WARDOGS_JOIN_PATTERN = /^\/pickup\/wardogs\/join\/([0-9a-fA-F-]{36})$/;

export const wardogsJoinPath = (guid: string): string => `/pickup/wardogs/join/${guid}`;

const HTML_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'Referrer-Policy': 'no-referrer',
};

const isAppLocale = (value: string): value is AppLocale =>
  (APP_LOCALES as readonly string[]).includes(value);

const localeFrom = (value: string | null): AppLocale =>
  value !== null && isAppLocale(value) ? value : DEFAULT_LOCALE;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const page = (
  status: number,
  locale: AppLocale,
  title: string,
  body: string,
  head = '',
): HttpResponse => ({
  status,
  headers: HTML_HEADERS,
  body: `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${head}<style>
body { font-family: system-ui, sans-serif; background: #0d0e10; color: #e6e6e6; margin: 0; padding: 3rem 1rem; text-align: center; }
a { color: #9fb86a; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`,
});

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
    const result = await deps.wardogs.getJoinLink(key);

    switch (result.kind) {
      case 'link': {
        const link = escapeHtml(result.link);
        const title = result.name ?? strings.wdJoinButton;
        // A meta refresh rather than a 302: the page stays behind with a link to
        // click if the browser asks before opening Steam, or the prompt is dismissed.
        return page(
          200,
          locale,
          title,
          `<p>${escapeHtml(strings.wdJoinOpening)}</p>\n<p><a href="${link}">${escapeHtml(strings.wdJoinFallback)}</a></p>`,
          `<meta http-equiv="refresh" content="0; url=${link}">\n`,
        );
      }
      case 'not-found':
        return page(
          404,
          locale,
          strings.wdJoinButton,
          `<p>${escapeHtml(strings.wdJoinUnavailable)}</p>`,
        );
      case 'rate-limited':
        return page(
          429,
          locale,
          strings.wdJoinButton,
          `<p>${escapeHtml(strings.wdRateLimited)}</p>`,
        );
      case 'invalid':
      case 'error':
        deps.logger.warn({ result: result.kind, key }, 'wardogs join link lookup failed');
        return page(
          502,
          locale,
          strings.wdJoinButton,
          `<p>${escapeHtml(strings.wdApiUnavailable)}</p>`,
        );
    }
  },
});
