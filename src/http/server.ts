import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Logger } from '../logger.ts';
import { resolveRequest } from './router.ts';
import type { HttpRoute } from './types.ts';

/** Placeholder origin: only the path and query of an incoming target are used. */
const ORIGIN = 'http://placeholder.invalid';

/** Forms here are a handful of short fields; anything far beyond that is not one of them. */
export const MAX_BODY_BYTES = 64 * 1024;

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export interface HttpServerOptions {
  readonly port: number;
  readonly routes: readonly HttpRoute[];
  readonly logger: Logger;
}

export interface RunningHttpServer {
  close(): void;
  /** The underlying socket, exposed so callers can read the bound address. */
  readonly server: Server;
}

class BodyTooLargeError extends Error {}

const readHeaders = (request: IncomingMessage): Record<string, string> =>
  Object.fromEntries(
    Object.entries(request.headers)
      .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
      .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]),
  );

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new BodyTooLargeError();
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

/**
 * The bot's own HTTP surface. Route-agnostic on purpose — it owns the socket and
 * the request/response plumbing, and knows nothing about what any route serves.
 */
export const startHttpServer = (options: HttpServerOptions): RunningHttpServer => {
  const server = createServer(async (request, response) => {
    const method = request.method ?? 'GET';

    try {
      const target = new URL(request.url ?? '/', ORIGIN);
      const body = METHODS_WITH_BODY.has(method) ? await readBody(request) : '';
      const resolved = await resolveRequest(
        {
          method,
          pathname: target.pathname,
          query: target.searchParams,
          headers: readHeaders(request),
          body,
          remoteAddress: request.socket.remoteAddress ?? null,
        },
        options.routes,
      );

      // HEAD carries the headers of the matching GET with no body, which is what
      // calendar clients that probe before downloading expect.
      response.writeHead(resolved.status, resolved.headers);
      response.end(method === 'HEAD' ? '' : resolved.body);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        response.writeHead(413, {
          'Content-Type': 'text/plain; charset=utf-8',
          Connection: 'close',
        });
        response.end('Payload too large');
        return;
      }
      options.logger.error({ err: error, url: request.url }, 'http request failed');
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Internal server error');
    }
  });

  server.on('error', (error) => {
    options.logger.error({ err: error, port: options.port }, 'http server error');
  });

  server.listen(options.port, '0.0.0.0', () => {
    options.logger.info({ port: options.port }, 'http server listening');
  });

  return {
    server,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
};
