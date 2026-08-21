import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningHttpServer, startHttpServer } from '../../src/http/server.ts';
import type { HttpRoute } from '../../src/http/types.ts';
import { type RecordingLogger, recordingLogger, silentLogger } from '../helpers/fakes.ts';

// The server binds a real socket, so every test tears its own down.
let running: (RunningHttpServer & { readonly port: number }) | null = null;

const ok: HttpRoute = {
  methods: ['GET', 'HEAD'],
  pattern: /^\/thing\/(\d+)$/,
  handle: (match, request) => ({
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Thing': match[1] ?? '' },
    body: `thing ${match[1]} lang=${request.query.get('lang') ?? 'none'}`,
  }),
};

const exploding: HttpRoute = {
  methods: ['GET'],
  pattern: /^\/boom$/,
  handle: () => {
    throw new Error('route exploded');
  },
};

/** Port 0 lets the OS pick a free port, which is only known once bound. */
const listen = async (routes: readonly HttpRoute[], logger = silentLogger()) => {
  const started = startHttpServer({ port: 0, routes, logger });

  if (started.server.address() === null) {
    await once(started.server, 'listening');
  }

  running = { ...started, port: (started.server.address() as AddressInfo).port };
  return running;
};

const fetchPath = async (path: string, init?: RequestInit): Promise<Response> =>
  fetch(`http://127.0.0.1:${running?.port ?? 0}${path}`, init);

afterEach(() => {
  running?.close();
  running = null;
});

describe('startHttpServer', () => {
  it('serves a matching route over a real socket', async () => {
    await listen([ok]);
    const response = await fetchPath('/thing/42?lang=en');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('x-thing')).toBe('42');
    expect(await response.text()).toBe('thing 42 lang=en');
  });

  it('answers 404 for an unrouted path', async () => {
    await listen([ok]);
    expect((await fetchPath('/nothing')).status).toBe(404);
  });

  it('answers 405 for a method the route does not take', async () => {
    await listen([ok]);
    const response = await fetchPath('/thing/42', { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });

  it('answers HEAD with the headers of the GET and no body', async () => {
    await listen([ok]);
    const response = await fetchPath('/thing/42', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-thing')).toBe('42');
    expect(await response.text()).toBe('');
  });

  it('keeps the query string out of the matched path', async () => {
    await listen([ok]);
    expect((await fetchPath('/thing/42?x=/nope')).status).toBe(200);
  });

  it('turns a throwing route into a 500 and logs it', async () => {
    const recorder: RecordingLogger = recordingLogger();
    await listen([exploding], recorder.logger);

    const response = await fetchPath('/boom');

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal server error');
    expect(recorder.find('http request failed')?.level).toBe('error');
  });

  it('survives a request that threw and keeps serving', async () => {
    await listen([ok, exploding]);

    expect((await fetchPath('/boom')).status).toBe(500);
    expect((await fetchPath('/thing/7')).status).toBe(200);
  });

  it('refuses connections once closed', async () => {
    const server = await listen([ok]);
    expect((await fetchPath('/thing/1')).status).toBe(200);

    server.close();
    running = null;

    await expect(fetch(`http://127.0.0.1:${server.port}/thing/1`)).rejects.toThrow();
  });
});

describe('socket failures', () => {
  it('logs rather than throws when the port is already taken', async () => {
    const first = await listen([ok]);
    const recorder: RecordingLogger = recordingLogger();

    const second = startHttpServer({ port: first.port, routes: [ok], logger: recorder.logger });
    await once(second.server, 'error');

    expect(recorder.find('http server error')?.level).toBe('error');
    second.close();
  });
});
