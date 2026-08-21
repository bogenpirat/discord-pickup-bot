import { describe, expect, it } from 'vitest';
import { resolveRequest } from '../../src/http/router.ts';
import type { HttpRequest, HttpRoute } from '../../src/http/types.ts';

const request = (pathname: string, method = 'GET'): HttpRequest => ({
  method,
  pathname,
  query: new URLSearchParams(),
});

const route = (pattern: RegExp, body: string, methods: readonly string[] = ['GET']): HttpRoute => ({
  methods,
  pattern,
  handle: (match) => ({ status: 200, headers: {}, body: `${body}:${match[1] ?? ''}` }),
});

describe('resolveRequest', () => {
  it('hands the path to the first matching route', () => {
    const resolved = resolveRequest(request('/a/7'), [
      route(/^\/b\/(\d+)$/, 'b'),
      route(/^\/a\/(\d+)$/, 'a'),
    ]);

    expect(resolved.status).toBe(200);
    expect(resolved.body).toBe('a:7');
  });

  it('stops at the first match when two routes overlap', () => {
    const resolved = resolveRequest(request('/a/7'), [
      route(/^\/a\/(\d+)$/, 'first'),
      route(/^\/a\/(\d+)$/, 'second'),
    ]);

    expect(resolved.body).toBe('first:7');
  });

  it('answers 404 for a path no route claims', () => {
    expect(resolveRequest(request('/nope'), [route(/^\/a$/, 'a')]).status).toBe(404);
  });

  it('answers 404 with an empty table', () => {
    expect(resolveRequest(request('/a'), []).status).toBe(404);
  });

  // A mistyped verb is a different mistake from a mistyped path.
  it('answers 405 when the path matches but the method does not', () => {
    const resolved = resolveRequest(request('/a', 'POST'), [route(/^\/a$/, 'a', ['GET', 'HEAD'])]);

    expect(resolved.status).toBe(405);
    expect(resolved.headers['Allow']).toBe('GET, HEAD');
  });

  it('prefers a later route that accepts the method over an earlier one that does not', () => {
    const resolved = resolveRequest(request('/a', 'POST'), [
      route(/^\/a$/, 'get-only', ['GET']),
      route(/^\/a$/, 'post', ['POST']),
    ]);

    expect(resolved.status).toBe(200);
    expect(resolved.body).toBe('post:');
  });

  // A global regex carries lastIndex between calls, which would make every
  // second request on the same route miss.
  it('matches the same route repeatedly', () => {
    const routes = [route(/^\/a\/(\d+)$/g, 'a')];

    expect(resolveRequest(request('/a/1'), routes).body).toBe('a:1');
    expect(resolveRequest(request('/a/2'), routes).body).toBe('a:2');
    expect(resolveRequest(request('/a/3'), routes).body).toBe('a:3');
  });
});
