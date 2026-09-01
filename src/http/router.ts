import type { HttpRequest, HttpResponse, HttpRoute } from './types.ts';

const plain = (status: number, body: string): HttpResponse => ({
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  body,
});

export const notFound = (): HttpResponse => plain(404, 'Not found');

/**
 * Walks the route table and returns the first match. A path that matches a route
 * whose method list does not is a 405 rather than a 404, so a mistyped verb is
 * distinguishable from a mistyped path.
 */
export const resolveRequest = async (
  request: HttpRequest,
  routes: readonly HttpRoute[],
): Promise<HttpResponse> => {
  let methodMismatch: HttpRoute | undefined;

  for (const route of routes) {
    const match = new RegExp(route.pattern).exec(request.pathname);

    if (match === null) {
      continue;
    }

    if (!route.methods.includes(request.method)) {
      methodMismatch ??= route;
      continue;
    }

    return route.handle(match, request);
  }

  if (methodMismatch !== undefined) {
    return {
      ...plain(405, 'Method not allowed'),
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Allow: methodMismatch.methods.join(', '),
      },
    };
  }

  return notFound();
};
