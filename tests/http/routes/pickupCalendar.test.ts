import { beforeEach, describe, expect, it } from 'vitest';
import type { PickupRepository } from '../../../src/db/repositories/pickupRepository.ts';
import { resolveRequest } from '../../../src/http/router.ts';
import { pickupCalendarRoute } from '../../../src/http/routes/pickupCalendar.ts';
import type { HttpResponse } from '../../../src/http/types.ts';
import { createTestContext } from '../../helpers/fakes.ts';

const BASE_URL = 'http://pickup.example.net:18080';
const STARTS_AT = Date.UTC(2026, 7, 22, 19, 0);
const NOW = Date.UTC(2026, 7, 21, 12, 0);

let pickups: PickupRepository;
let guildNames: Map<string, string>;

const seed = (startsAt: number | null = STARTS_AT): number => {
  const id = pickups.create({
    guildId: 'guild-1',
    channelId: 'channel-1',
    creatorId: 'creator-1',
    startsAt,
    startsAtText: null,
    note: null,
  });
  pickups.attachMessage(id, 'message-1');
  return id;
};

const get = (path: string, method = 'GET'): Promise<HttpResponse> => {
  const target = new URL(path, BASE_URL);
  return resolveRequest({ method, pathname: target.pathname, query: target.searchParams }, [
    pickupCalendarRoute({
      pickups,
      guildName: (guildId) => guildNames.get(guildId) ?? null,
      baseUrl: BASE_URL,
      now: () => NOW,
    }),
  ]);
};

const propertyOf = (body: string, property: string): string | undefined =>
  body
    .replace(/\r\n /g, '')
    .split('\r\n')
    .find((line) => line.startsWith(`${property}:`))
    ?.slice(property.length + 1);

beforeEach(() => {
  pickups = createTestContext().pickups;
  guildNames = new Map([['guild-1', 'Test Guild']]);
});

describe('serving a pickup', () => {
  it('answers 200 with calendar headers', async () => {
    const id = seed();
    const response = await get(`/pickup/calendar/${id}.ics`);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(response.headers['Content-Disposition']).toBe(`attachment; filename="pickup-${id}.ics"`);
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('counts Content-Length in octets, not characters', async () => {
    guildNames.set('guild-1', 'Bögenpirat 🎮');
    const response = await get(`/pickup/calendar/${seed()}.ics`);

    expect(response.headers['Content-Length']).toBe(
      String(Buffer.byteLength(response.body, 'utf8')),
    );
    expect(Number(response.headers['Content-Length'])).toBeGreaterThan(response.body.length);
  });

  it('describes the event the pickup stands for', async () => {
    const body = (await get(`/pickup/calendar/${seed()}.ics`)).body;

    expect(propertyOf(body, 'SUMMARY')).toBe('Gaming-Session @ Test Guild');
    expect(propertyOf(body, 'DTSTART')).toBe('20260822T190000Z');
    expect(propertyOf(body, 'DTEND')).toBe('20260822T210000Z');
    expect(propertyOf(body, 'DTSTAMP')).toBe('20260821T120000Z');
    expect(propertyOf(body, 'URL')).toBe(
      'https://discord.com/channels/guild-1/channel-1/message-1',
    );
  });

  it('opens the description with the note and closes it with the link', async () => {
    const id = pickups.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      creatorId: 'creator-1',
      startsAt: STARTS_AT,
      startsAtText: null,
      note: 'Helldivers, 20:30',
    });
    pickups.attachMessage(id, 'message-1');

    // Newlines are a literal `\n` and the comma is escaped, per RFC 5545 §3.3.11.
    expect(propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'DESCRIPTION')).toBe(
      'Helldivers\\, 20:30\\n\\nOrganisiert über Discord: https://discord.com/channels/guild-1/channel-1/message-1',
    );
  });

  it('describes a pickup with a note but no message yet by the note alone', async () => {
    const id = pickups.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      creatorId: 'creator-1',
      startsAt: STARTS_AT,
      startsAtText: null,
      note: 'Helldivers',
    });

    expect(propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'DESCRIPTION')).toBe(
      'Helldivers',
    );
  });

  it('keys the uid on the pickup and the deployment host', async () => {
    const id = seed();
    expect(propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'UID')).toBe(
      `pickup-${id}@pickup.example.net:18080`,
    );
  });

  it('falls back to a bare title when the bot has left the guild', async () => {
    guildNames.clear();
    expect(propertyOf((await get(`/pickup/calendar/${seed()}.ics`)).body, 'SUMMARY')).toBe(
      'Gaming-Session',
    );
  });

  it('serves a pickup whose message id is not attached yet', async () => {
    const id = pickups.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      creatorId: 'creator-1',
      startsAt: STARTS_AT,
      startsAtText: null,
      note: null,
    });
    const response = await get(`/pickup/calendar/${id}.ics`);

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('URL:');
    expect(response.body).not.toContain('DESCRIPTION');
  });

  it('keeps serving a closed pickup, since the game still happens', async () => {
    const id = seed();
    pickups.close(id, NOW);

    expect((await get(`/pickup/calendar/${id}.ics`)).status).toBe(200);
  });
});

describe('locale', () => {
  it('defaults to german', async () => {
    expect(propertyOf((await get(`/pickup/calendar/${seed()}.ics`)).body, 'SUMMARY')).toBe(
      'Gaming-Session @ Test Guild',
    );
  });

  it('honours an explicit lang', async () => {
    expect(propertyOf((await get(`/pickup/calendar/${seed()}.ics?lang=en`)).body, 'SUMMARY')).toBe(
      'Gaming session @ Test Guild',
    );
  });

  it.each(['xx', '', 'de-DE', 'EN'])('falls back to the default for %o', async (lang) => {
    expect(
      propertyOf((await get(`/pickup/calendar/${seed()}.ics?lang=${lang}`)).body, 'SUMMARY'),
    ).toBe('Gaming-Session @ Test Guild');
  });
});

describe('rejections', () => {
  it('answers 404 for a pickup that does not exist', async () => {
    expect((await get('/pickup/calendar/999999.ics')).status).toBe(404);
  });

  it('answers 404 for a pickup with no discrete start time', async () => {
    expect((await get(`/pickup/calendar/${seed(null)}.ics`)).status).toBe(404);
  });

  it.each([
    '/pickup/calendar/abc.ics',
    '/pickup/calendar/1.txt',
    '/pickup/calendar/1',
    '/pickup/calendar/',
    '/pickup/1.ics',
    '/pickup/calendar/1.ics/extra',
    '/etc/passwd',
    '/',
  ])('answers 404 for %o', async (path) => {
    seed();
    expect((await get(path)).status).toBe(404);
  });

  // Beyond 2^53 the id stops surviving the round trip through Number.
  it('answers 404 for an id past the safe integer range', async () => {
    expect((await get('/pickup/calendar/99999999999999999999.ics')).status).toBe(404);
  });

  it('answers 405 for a write method on a real pickup', async () => {
    const response = await get(`/pickup/calendar/${seed()}.ics`, 'POST');

    expect(response.status).toBe(405);
    expect(response.headers['Allow']).toBe('GET, HEAD');
  });

  it('accepts HEAD', async () => {
    expect((await get(`/pickup/calendar/${seed()}.ics`, 'HEAD')).status).toBe(200);
  });
});

// The whole point of serving rather than baking the file into a link.
describe('freshness', () => {
  it('reflects a start time changed after the first download', async () => {
    const id = seed();
    expect(propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'DTSTART')).toBe(
      '20260822T190000Z',
    );

    pickups.setStart(id, Date.UTC(2026, 7, 22, 21, 30), null);

    expect(propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'DTSTART')).toBe(
      '20260822T213000Z',
    );
  });

  it('keeps the uid stable across that change, so clients update in place', async () => {
    const id = seed();
    const before = propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'UID');

    pickups.setStart(id, Date.UTC(2026, 7, 23, 20, 0), null);

    expect(propertyOf((await get(`/pickup/calendar/${id}.ics`)).body, 'UID')).toBe(before);
  });

  it('stops serving once a pickup is deleted', async () => {
    const id = seed();
    expect((await get(`/pickup/calendar/${id}.ics`)).status).toBe(200);

    pickups.remove(id);

    expect((await get(`/pickup/calendar/${id}.ics`)).status).toBe(404);
  });
});

// Env validation pins the base url to an http(s) origin, so this is a guard
// against the route being reused with something looser rather than a live path.
describe('a base url that is not a url', () => {
  it('still serves, falling back to a generic uid host', async () => {
    const id = pickups.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      creatorId: 'creator-1',
      startsAt: STARTS_AT,
      startsAtText: null,
      note: null,
    });

    const route = pickupCalendarRoute({
      pickups,
      guildName: () => null,
      baseUrl: 'not a url',
      now: () => NOW,
    });
    const target = new URL(`/pickup/calendar/${id}.ics`, BASE_URL);
    const response = await resolveRequest(
      { method: 'GET', pathname: target.pathname, query: target.searchParams },
      [route],
    );

    expect(response.status).toBe(200);
    expect(propertyOf(response.body, 'UID')).toBe(`pickup-${id}@discord-pickup-bot`);
  });
});
