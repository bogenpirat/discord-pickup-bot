import { timingSafeEqual } from 'node:crypto';
import type { Logger } from '../../logger.ts';
import { CATALOG_BY_ID, type ParamValues } from '../../valorant/catalog.ts';
import type { ValorantClient } from '../../valorant/client.ts';
import { playgroundPage } from '../playgroundPage.ts';
import { notFound } from '../router.ts';
import type { HttpRequest, HttpResponse, HttpRoute } from '../types.ts';

export interface ValorantPlaygroundDeps {
  readonly client: ValorantClient;
  /** The unguessable first path segment. Everything hangs off it. */
  readonly secret: string;
  readonly logger: Logger;
}

/**
 * `/<secret>/valorant-playground` and its `/call` sibling. The secret is a path
 * segment rather than part of the pattern so a wrong one is compared in constant
 * time and answered with the same 404 as a path that matches nothing at all.
 */
export const VALORANT_PLAYGROUND_PATTERN = /^\/([^/]+)\/valorant-playground(\/call)?$/;

const HTML_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  // The page runs only its own inline script and loads nothing from anywhere.
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'",
  'Referrer-Policy': 'no-referrer',
};

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

const json = (status: number, body: unknown): HttpResponse => ({
  status,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

/**
 * Compares in constant time. Lengths are compared first because `timingSafeEqual`
 * throws on a mismatch, and a length difference is not worth hiding.
 */
const matchesSecret = (candidate: string, secret: string): boolean => {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Reads form values out of the query string, in the shape the catalog expects. */
const valuesFrom = (query: URLSearchParams): ParamValues => {
  const read = (name: string): string | undefined => {
    const value = query.get(name);
    return value === null || value.trim() === '' ? undefined : value.trim();
  };

  return {
    text: (name) => read(name) ?? '',
    optionalText: read,
    optionalNumber: (name) => {
      const value = read(name);
      if (value === undefined) {
        return undefined;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
    optionalBoolean: (name) => {
      const value = read(name);
      return value === undefined ? undefined : value === 'true';
    },
  };
};

const missingRequired = (
  entry: NonNullable<ReturnType<(typeof CATALOG_BY_ID)['get']>>,
  values: ParamValues,
): readonly string[] =>
  entry.params
    .filter((param) => param.required && values.optionalText(param.name) === undefined)
    .map((param) => param.name);

export const valorantPlaygroundRoute = (deps: ValorantPlaygroundDeps): HttpRoute => ({
  methods: ['GET', 'HEAD'],
  pattern: VALORANT_PLAYGROUND_PATTERN,

  handle: async (match, request: HttpRequest): Promise<HttpResponse> => {
    if (!matchesSecret(match[1] ?? '', deps.secret)) {
      return notFound();
    }

    if (match[2] === undefined) {
      const limiter = deps.client.stats();
      return {
        status: 200,
        headers: HTML_HEADERS,
        body: playgroundPage({ used: limiter.used, limit: limiter.limit }),
      };
    }

    const id = request.query.get('endpoint') ?? '';
    const entry = CATALOG_BY_ID.get(id);

    if (entry === undefined) {
      return json(400, { ok: false, error: { kind: 'unknown-endpoint', endpoint: id } });
    }

    const values = valuesFrom(request.query);
    const missing = missingRequired(entry, values);

    if (missing.length > 0) {
      return json(400, { ok: false, error: { kind: 'missing-parameters', missing } });
    }

    const started = Date.now();
    const result = await entry.invoke(deps.client, values);
    const stats = deps.client.stats();

    deps.logger.info(
      { endpoint: id, ok: result.ok, ms: Date.now() - started },
      'valorant playground call',
    );

    const rateLimit = { used: stats.used, limit: stats.limit, waiting: stats.waiting };

    if (!result.ok) {
      return json(200, { ok: false, error: result.error, rateLimit });
    }

    // The crosshair endpoint answers with PNG bytes, which the page shows as an
    // image rather than printing as a list of numbers.
    if (entry.renders === 'image' && result.value instanceof Uint8Array) {
      return json(200, {
        ok: true,
        image: Buffer.from(result.value).toString('base64'),
        rateLimit,
      });
    }

    return json(200, { ok: true, value: result.value, rateLimit });
  },
});
