import { describe, expect, it } from 'vitest';
import type {
  LiveServerDetail,
  WardogsServer,
} from '../../src/domain/wardogs/parseServerDetail.ts';
import { stringsFor } from '../../src/ui/strings.ts';
import { buildWardogsEmbed, humanizeSky } from '../../src/ui/wardogsServer.ts';

const MATCH_START = 1_792_884_010_275;

const SERVER: WardogsServer = {
  name: 'ASDZ - Alte Säcke Die Zocken | DE | GER',
  players: 81,
  maxPlayers: 100,
  map: 'Madrid',
  world: 'Europe',
  sky: 'DayClear',
  matchStart: MATCH_START,
  passworded: false,
  imageUrl: 'https://files.catbox.moe/32cmfy.png',
};

const UPDATED_AT = Temporal.Instant.from('2026-10-24T23:42:18.954Z');
const NOW = Temporal.Instant.fromEpochMilliseconds(MATCH_START + 82 * 60_000);
const LINK_KEY = 'eu-central|asdz-alte-säcke-die-zocken-de-ger';
const en = stringsFor('en');

const detail = (overrides: Partial<LiveServerDetail> = {}): LiveServerDetail => ({
  kind: 'live',
  server: SERVER,
  updatedAt: UPDATED_AT,
  linkKey: LINK_KEY,
  ...overrides,
});

const fieldsOf = (server: WardogsServer, now = NOW) =>
  buildWardogsEmbed(detail({ server }), en, now).toJSON();

describe('humanizeSky', () => {
  it('splits the camel case', () => {
    expect(humanizeSky('DayLateGrayFog')).toBe('Day Late Gray Fog');
    expect(humanizeSky('Night')).toBe('Night');
  });
});

describe('buildWardogsEmbed', () => {
  it('shows name, players, map, sky and the round length', () => {
    const embed = fieldsOf(SERVER);

    expect(embed.title).toBe(SERVER.name);
    expect(embed.description).toBeUndefined();
    expect(embed.thumbnail?.url).toBe(SERVER.imageUrl);
    expect(embed.timestamp).toBe('2026-10-24T23:42:18.954Z');
    expect(embed.fields).toEqual([
      { name: 'Players', value: '81/100', inline: true },
      { name: 'Map', value: 'Madrid (Europe)', inline: true },
      { name: 'Sky', value: 'Day Clear', inline: true },
      {
        name: 'Round running for',
        value: `1h 22m (since <t:${Math.floor(MATCH_START / 1000)}:t>)`,
        inline: true,
      },
    ]);
  });

  it('leaves the round out without a start', () => {
    const embed = fieldsOf({ ...SERVER, matchStart: null });
    expect(embed.fields?.map((field) => field.name)).toEqual(['Players', 'Map', 'Sky']);
  });

  it('leaves the round out when the start is implausible', () => {
    const embed = fieldsOf(SERVER, Temporal.Instant.fromEpochMilliseconds(MATCH_START - 1));
    expect(embed.fields).toHaveLength(3);
  });

  it('marks a passworded server', () => {
    const embed = fieldsOf({ ...SERVER, passworded: true });
    expect(embed.description).toBe('🔒 Password');
  });

  it.each([null, 'http://example.com/a.png', 'not a url'])('skips the thumbnail %j', (imageUrl) => {
    expect(fieldsOf({ ...SERVER, imageUrl }).thumbnail).toBeUndefined();
  });

  it('links the title to the server page and shows its banner, versioned by the poll', () => {
    const embed = fieldsOf(SERVER);
    expect(embed.url).toBe(
      'https://wardogserverlist.com/server?key=eu-central%7Casdz-alte-s%C3%A4cke-die-zocken-de-ger',
    );
    expect(embed.image?.url).toBe(
      'https://wardogserverlist.com/banner.jpg?key=eu-central%7Casdz-alte-s%C3%A4cke-die-zocken-de-ger&style=wide&v=1792885338',
    );
  });

  it('has no timestamp without updatedAt, and versions the banner by now instead', () => {
    const embed = buildWardogsEmbed(detail({ updatedAt: null }), en, NOW).toJSON();
    expect(embed.timestamp).toBeUndefined();
    expect(embed.image?.url).toContain(`&v=${Math.floor(NOW.epochMilliseconds / 1000)}`);
  });

  it('has no banner or link without a link key', () => {
    const embed = buildWardogsEmbed(detail({ linkKey: null }), en, NOW).toJSON();
    expect(embed.image).toBeUndefined();
    expect(embed.url).toBeUndefined();
  });
});
