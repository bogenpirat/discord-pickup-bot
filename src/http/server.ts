import { createServer, type Server } from 'node:http';
import type { Logger } from '../logger.ts';
import { resolveRequest } from './router.ts';
import type { HttpRoute } from './types.ts';

/** Placeholder origin: only the path and query of an incoming target are used. */
const ORIGIN = 'http://placeholder.invalid';

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

/**
 * The bot's own HTTP surface. Route-agnostic on purpose — it owns the socket and
 * the request/response plumbing, and knows nothing about what any route serves.
 */
export const startHttpServer = (options: HttpServerOptions): RunningHttpServer => {
  const server = createServer((request, response) => {
    const method = request.method ?? 'GET';

    try {
      const target = new URL(request.url ?? '/', ORIGIN);
      const resolved = resolveRequest(
        { method, pathname: target.pathname, query: target.searchParams },
        options.routes,
      );

      // HEAD carries the headers of the matching GET with no body, which is what
      // calendar clients that probe before downloading expect.
      const body = method === 'HEAD' ? '' : resolved.body;

      response.writeHead(resolved.status, resolved.headers);
      response.end(body);
    } catch (error) {
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
