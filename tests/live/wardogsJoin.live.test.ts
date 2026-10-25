import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { resolveRequest } from '../../src/http/router.ts';
import { wardogsJoinRoute } from '../../src/http/routes/wardogsJoin.ts';
import { createWardogsClient } from '../../src/wardogs/client.ts';
import { silentLogger } from '../helpers/fakes.ts';

/**
 * Talks to the real wardogserverlist.com, so it is kept out of `npm test` and
 * run with `npm run test:live`. It pins down the undocumented contract the join
 * button relies on: a JSON POST of `{ key }` to `/discord/api/join`, let through
 * only with the site's own `Origin`, answering with a `steam://joinlobby` link.
 * A failure here means the site changed that contract, not that the bot broke.
 *
 * Every test sends at most one join request; the site rate-limits joins per IP.
 */

const JOIN_URL = 'https://wardogserverlist.com/discord/api/join';
const SERVERS_URL = 'https://wardogserverlist.com/api/servers-lite';
const UNKNOWN_KEY = 'id|00000000-0000-0000-0000-000000000000';
const STEAM_LOBBY_LINK = /^steam:\/\/joinlobby\/\d+\/\d+$/;

const serversSchema = z.object({
  servers: z.array(
    z.object({
      serverKey: z.string(),
      official: z.boolean().nullish(),
      players: z.number(),
    }),
  ),
});

/**
 * A community server that is up right now, picked from the site's own list so the
 * test does not hang on one server staying online. The busiest is the least
 * likely to go offline between the list and the join.
 */
const findLiveServerKey = async (): Promise<string> => {
  const response = await fetch(SERVERS_URL);
  expect(response.status, `${SERVERS_URL} status`).toBe(200);

  const { servers } = serversSchema.parse(await response.json());
  const busiest = servers
    .filter((server) => server.official !== true && server.serverKey.startsWith('id|'))
    .sort((a, b) => b.players - a.players)[0];

  if (busiest === undefined) {
    throw new Error(`${SERVERS_URL} listed no community server to join`);
  }
  return busiest.serverKey;
};

const postJoin = (key: string, headers: Readonly<Record<string, string>>) =>
  fetch(JOIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ key }),
  });

describe('wardogserverlist.com join api', () => {
  it('hands the client a steam lobby link for a live server', async () => {
    const key = await findLiveServerKey();
    const result = await createWardogsClient().getJoinLink(key);

    expect(result, `join link for ${key}`).toMatchObject({
      kind: 'link',
      link: expect.stringMatching(STEAM_LOBBY_LINK),
    });
  });

  it('serves the join page that redirects to steam', async () => {
    const key = await findLiveServerKey();
    const guid = key.slice('id|'.length);
    const response = await resolveRequest(
      { method: 'GET', pathname: `/pickup/wardogs/join/${guid}`, query: new URLSearchParams() },
      [wardogsJoinRoute({ wardogs: createWardogsClient(), logger: silentLogger() })],
    );

    expect(response.status, `join page for ${key}`).toBe(200);
    expect(response.body).toMatch(
      /<meta http-equiv="refresh" content="0; url=steam:\/\/joinlobby\/\d+\/\d+">/,
    );
  });

  it('reports an unknown server as not found', async () => {
    expect(await createWardogsClient().getJoinLink(UNKNOWN_KEY)).toEqual({ kind: 'not-found' });
  });

  // The client sends the Origin header because of this. Should the site drop
  // the check, the header is harmless, but the comment in the client is wrong.
  it('still refuses a request without the site as origin', async () => {
    const response = await postJoin(UNKNOWN_KEY, {});

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });
});
