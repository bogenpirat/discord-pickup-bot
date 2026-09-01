import type { ValorantClient, ValorantResult } from './client.ts';
import type { Affinity, Platform } from './http.ts';
import type { MatchMode, VlrEventType, VlrPlayerTimespan } from './types.ts';

/**
 * A machine-readable description of the client's surface, used by the HTTP
 * playground to render a form per endpoint and to call the right method. Each
 * `invoke` goes through the real typed method, so this file cannot drift into
 * calling something the client does not have.
 */
export interface CatalogParam {
  readonly name: string;
  readonly required: boolean;
  readonly type: 'string' | 'number' | 'boolean';
  /** Shown as the input placeholder, and doubles as the parameter's documentation. */
  readonly example?: string;
  /** When set, the form offers a dropdown instead of a free-text field. */
  readonly options?: readonly string[];
}

export interface CatalogEntry {
  readonly id: string;
  readonly group: string;
  /** The upstream path, so the playground can show what it is about to call. */
  readonly path: string;
  readonly params: readonly CatalogParam[];
  /** `image` endpoints answer with bytes, which the playground shows rather than prints. */
  readonly renders?: 'image';
  invoke(client: ValorantClient, values: ParamValues): Promise<ValorantResult<unknown>>;
}

export interface ParamValues {
  text(name: string): string;
  optionalText(name: string): string | undefined;
  optionalNumber(name: string): number | undefined;
  optionalBoolean(name: string): boolean | undefined;
}

const AFFINITIES: readonly string[] = ['eu', 'na', 'ap', 'kr', 'latam', 'br'];
const PLATFORMS: readonly string[] = ['pc', 'console'];
const MODES: readonly string[] = ['Competitive', 'Unrated', 'Custom', 'Practice', 'Unknown'];
const EVENT_TYPES: readonly string[] = ['upcoming', 'completed'];
const TIMESPANS: readonly string[] = ['all', '30d', '60d', '90d'];

const affinity = (): CatalogParam => ({
  name: 'affinity',
  required: true,
  type: 'string',
  example: 'eu',
  options: AFFINITIES,
});

const platform = (): CatalogParam => ({
  name: 'platform',
  required: true,
  type: 'string',
  example: 'pc',
  options: PLATFORMS,
});

const name = (): CatalogParam => ({
  name: 'name',
  required: true,
  type: 'string',
  example: 'Riot name without the tag',
});

const tag = (): CatalogParam => ({ name: 'tag', required: true, type: 'string', example: 'EUW' });

const puuid = (): CatalogParam => ({
  name: 'puuid',
  required: true,
  type: 'string',
  example: 'stable id from /valo-account',
});

const optional = (
  paramName: string,
  type: CatalogParam['type'],
  example?: string,
  options?: readonly string[],
): CatalogParam => ({
  name: paramName,
  required: false,
  type,
  ...(example === undefined ? {} : { example }),
  ...(options === undefined ? {} : { options }),
});

const mode = (): CatalogParam => optional('mode', 'string', 'Competitive', MODES);
const season = (): CatalogParam => optional('season', 'string', 'e10a3');
const size = (): CatalogParam => optional('size', 'number', '5');
const page = (): CatalogParam => optional('page', 'number', '1');

const matchQuery = (values: ParamValues) => ({
  mode: values.optionalText('mode') as MatchMode | undefined,
  map: values.optionalText('map'),
  size: values.optionalNumber('size'),
  start: values.optionalNumber('start'),
});

const asAffinity = (values: ParamValues): Affinity => values.text('affinity') as Affinity;
const asPlatform = (values: ParamValues): Platform => values.text('platform') as Platform;

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'getAccount',
    group: 'Account',
    path: 'GET /valorant/v2/account/{name}/{tag}',
    params: [name(), tag(), optional('force', 'boolean')],
    invoke: (client, values) =>
      client.getAccount(values.text('name'), values.text('tag'), {
        force: values.optionalBoolean('force'),
      }),
  },
  {
    id: 'getAccountByPuuid',
    group: 'Account',
    path: 'GET /valorant/v2/by-puuid/account/{puuid}',
    params: [puuid(), optional('force', 'boolean')],
    invoke: (client, values) =>
      client.getAccountByPuuid(values.text('puuid'), { force: values.optionalBoolean('force') }),
  },

  {
    id: 'getMmr',
    group: 'Rank',
    path: 'GET /valorant/v3/mmr/{affinity}/{platform}/{name}/{tag}',
    params: [affinity(), platform(), name(), tag()],
    invoke: (client, values) =>
      client.getMmr(
        asAffinity(values),
        asPlatform(values),
        values.text('name'),
        values.text('tag'),
      ),
  },
  {
    id: 'getMmrByPuuid',
    group: 'Rank',
    path: 'GET /valorant/v3/by-puuid/mmr/{affinity}/{platform}/{puuid}',
    params: [affinity(), platform(), puuid()],
    invoke: (client, values) =>
      client.getMmrByPuuid(asAffinity(values), asPlatform(values), values.text('puuid')),
  },
  {
    id: 'getMmrHistory',
    group: 'Rank',
    path: 'GET /valorant/v2/mmr-history/{affinity}/{platform}/{name}/{tag}',
    params: [affinity(), platform(), name(), tag()],
    invoke: (client, values) =>
      client.getMmrHistory(
        asAffinity(values),
        asPlatform(values),
        values.text('name'),
        values.text('tag'),
      ),
  },
  {
    id: 'getMmrHistoryByPuuid',
    group: 'Rank',
    path: 'GET /valorant/v2/by-puuid/mmr-history/{affinity}/{platform}/{puuid}',
    params: [affinity(), platform(), puuid()],
    invoke: (client, values) =>
      client.getMmrHistoryByPuuid(asAffinity(values), asPlatform(values), values.text('puuid')),
  },

  {
    id: 'getMatches',
    group: 'Matches',
    path: 'GET /valorant/v4/matches/{affinity}/{platform}/{name}/{tag}',
    params: [
      affinity(),
      platform(),
      name(),
      tag(),
      mode(),
      optional('map', 'string', 'Ascent'),
      size(),
      optional('start', 'number', '0'),
    ],
    invoke: (client, values) =>
      client.getMatches(
        asAffinity(values),
        asPlatform(values),
        values.text('name'),
        values.text('tag'),
        matchQuery(values),
      ),
  },
  {
    id: 'getMatchesByPuuid',
    group: 'Matches',
    path: 'GET /valorant/v4/by-puuid/matches/{affinity}/{platform}/{puuid}',
    params: [
      affinity(),
      platform(),
      puuid(),
      mode(),
      optional('map', 'string', 'Ascent'),
      size(),
      optional('start', 'number', '0'),
    ],
    invoke: (client, values) =>
      client.getMatchesByPuuid(
        asAffinity(values),
        asPlatform(values),
        values.text('puuid'),
        matchQuery(values),
      ),
  },
  {
    id: 'getMatch',
    group: 'Matches',
    path: 'GET /valorant/v4/match/{affinity}/{match_id}',
    params: [
      affinity(),
      { name: 'matchId', required: true, type: 'string', example: 'match uuid' },
    ],
    invoke: (client, values) => client.getMatch(asAffinity(values), values.text('matchId')),
  },

  {
    id: 'getStoredMatches',
    group: 'Stored',
    path: 'GET /valorant/v1/stored-matches/{affinity}/{name}/{tag}',
    params: [affinity(), name(), tag(), mode(), optional('map', 'string', 'Ascent'), size()],
    invoke: (client, values) =>
      client.getStoredMatches(asAffinity(values), values.text('name'), values.text('tag'), {
        mode: values.optionalText('mode') as MatchMode | undefined,
        map: values.optionalText('map'),
        size: values.optionalNumber('size'),
      }),
  },
  {
    id: 'getStoredMatchesByPuuid',
    group: 'Stored',
    path: 'GET /valorant/v1/by-puuid/stored-matches/{affinity}/{puuid}',
    params: [affinity(), puuid(), mode(), optional('map', 'string', 'Ascent'), size()],
    invoke: (client, values) =>
      client.getStoredMatchesByPuuid(asAffinity(values), values.text('puuid'), {
        mode: values.optionalText('mode') as MatchMode | undefined,
        map: values.optionalText('map'),
        size: values.optionalNumber('size'),
      }),
  },
  {
    id: 'getStoredMmrHistory',
    group: 'Stored',
    path: 'GET /valorant/v2/stored-mmr-history/{affinity}/{platform}/{name}/{tag}',
    params: [affinity(), platform(), name(), tag(), size()],
    invoke: (client, values) =>
      client.getStoredMmrHistory(
        asAffinity(values),
        asPlatform(values),
        values.text('name'),
        values.text('tag'),
        { size: values.optionalNumber('size') },
      ),
  },
  {
    id: 'getStoredMmrHistoryByPuuid',
    group: 'Stored',
    path: 'GET /valorant/v2/by-puuid/stored-mmr-history/{affinity}/{platform}/{puuid}',
    params: [affinity(), platform(), puuid(), size()],
    invoke: (client, values) =>
      client.getStoredMmrHistoryByPuuid(
        asAffinity(values),
        asPlatform(values),
        values.text('puuid'),
        { size: values.optionalNumber('size') },
      ),
  },

  {
    id: 'getLeaderboard',
    group: 'Leaderboard',
    path: 'GET /valorant/v3/leaderboard/{affinity}/{platform}',
    params: [
      affinity(),
      platform(),
      season(),
      size(),
      page(),
      optional('name', 'string', 'jump to this Riot name'),
      optional('tag', 'string', 'EUW'),
    ],
    invoke: (client, values) =>
      client.getLeaderboard(asAffinity(values), asPlatform(values), {
        season: values.optionalText('season'),
        size: values.optionalNumber('size'),
        page: values.optionalNumber('page'),
        name: values.optionalText('name'),
        tag: values.optionalText('tag'),
      }),
  },

  {
    id: 'searchPremierTeams',
    group: 'Premier',
    path: 'GET /valorant/v1/premier/search',
    params: [
      optional('name', 'string', 'team name'),
      optional('tag', 'string', 'team tag'),
      optional('id', 'string', 'team uuid'),
      season(),
    ],
    invoke: (client, values) =>
      client.searchPremierTeams({
        name: values.optionalText('name'),
        tag: values.optionalText('tag'),
        id: values.optionalText('id'),
        season: values.optionalText('season'),
      }),
  },
  {
    id: 'getPremierLeaderboard',
    group: 'Premier',
    path: 'GET /valorant/v1/premier/leaderboard/{affinity}',
    params: [
      affinity(),
      optional('conference', 'string', 'EU_CENTRAL_EAST'),
      optional('division', 'string', '1'),
      season(),
    ],
    invoke: (client, values) =>
      client.getPremierLeaderboard(asAffinity(values), {
        conference: values.optionalText('conference'),
        division: values.optionalText('division'),
        season: values.optionalText('season'),
      }),
  },
  {
    id: 'getPremierTeam',
    group: 'Premier',
    path: 'GET /valorant/v1/premier/{name}/{tag}',
    params: [name(), tag(), season(), optional('affinity', 'string', 'eu', AFFINITIES)],
    invoke: (client, values) =>
      client.getPremierTeam(values.text('name'), values.text('tag'), {
        season: values.optionalText('season'),
        affinity: values.optionalText('affinity') as Affinity | undefined,
      }),
  },
  {
    id: 'getPremierTeamById',
    group: 'Premier',
    path: 'GET /valorant/v1/premier/{id}',
    params: [
      { name: 'id', required: true, type: 'string', example: 'team uuid' },
      season(),
      optional('affinity', 'string', 'eu', AFFINITIES),
    ],
    invoke: (client, values) =>
      client.getPremierTeamById(values.text('id'), {
        season: values.optionalText('season'),
        affinity: values.optionalText('affinity') as Affinity | undefined,
      }),
  },
  {
    id: 'getPremierTeamHistory',
    group: 'Premier',
    path: 'GET /valorant/v1/premier/{name}/{tag}/history',
    params: [name(), tag(), season()],
    invoke: (client, values) =>
      client.getPremierTeamHistory(values.text('name'), values.text('tag'), {
        season: values.optionalText('season'),
      }),
  },
  {
    id: 'getPremierTeamHistoryById',
    group: 'Premier',
    path: 'GET /valorant/v1/premier/{id}/history',
    params: [{ name: 'id', required: true, type: 'string', example: 'team uuid' }, season()],
    invoke: (client, values) =>
      client.getPremierTeamHistoryById(values.text('id'), {
        season: values.optionalText('season'),
      }),
  },

  {
    id: 'getEsportsSchedule',
    group: 'Esports',
    path: 'GET /valorant/v1/esports/schedule',
    params: [optional('region', 'string', 'emea'), optional('league', 'string', 'vct_emea')],
    invoke: (client, values) =>
      client.getEsportsSchedule({
        region: values.optionalText('region'),
        league: values.optionalText('league'),
      }),
  },
  {
    id: 'getVlrEvents',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/events',
    params: [
      optional('region', 'string', 'emea'),
      optional('type', 'string', 'upcoming', EVENT_TYPES),
      page(),
    ],
    invoke: (client, values) =>
      client.getVlrEvents({
        region: values.optionalText('region'),
        type: values.optionalText('type') as VlrEventType | undefined,
        page: values.optionalNumber('page'),
      }),
  },
  {
    id: 'getVlrEventMatches',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/events/{event_id}/matches',
    params: [{ name: 'eventId', required: true, type: 'number', example: '2097' }],
    invoke: (client, values) => client.getVlrEventMatches(values.optionalNumber('eventId') ?? 0),
  },
  {
    id: 'getVlrMatch',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/matches/{match_id}',
    params: [{ name: 'matchId', required: true, type: 'string', example: '353177' }],
    invoke: (client, values) => client.getVlrMatch(values.text('matchId')),
  },
  {
    id: 'getVlrTeam',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/teams/{team_id}',
    params: [{ name: 'teamId', required: true, type: 'number', example: '2593' }],
    invoke: (client, values) => client.getVlrTeam(values.optionalNumber('teamId') ?? 0),
  },
  {
    id: 'getVlrTeamMatches',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/teams/{team_id}/matches',
    params: [{ name: 'teamId', required: true, type: 'number', example: '2593' }, page()],
    invoke: (client, values) =>
      client.getVlrTeamMatches(values.optionalNumber('teamId') ?? 0, {
        page: values.optionalNumber('page'),
      }),
  },
  {
    id: 'getVlrTeamTransactions',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/teams/{team_id}/transactions',
    params: [{ name: 'teamId', required: true, type: 'number', example: '2593' }],
    invoke: (client, values) => client.getVlrTeamTransactions(values.optionalNumber('teamId') ?? 0),
  },
  {
    id: 'getVlrPlayer',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/players/{player_id}',
    params: [
      { name: 'playerId', required: true, type: 'number', example: '9' },
      optional('timespan', 'string', 'all', TIMESPANS),
    ],
    invoke: (client, values) =>
      client.getVlrPlayer(values.optionalNumber('playerId') ?? 0, {
        timespan: values.optionalText('timespan') as VlrPlayerTimespan | undefined,
      }),
  },
  {
    id: 'getVlrPlayerMatches',
    group: 'Esports',
    path: 'GET /valorant/v2/esports/vlr/players/{player}/matches',
    params: [{ name: 'playerId', required: true, type: 'number', example: '9' }, page()],
    invoke: (client, values) =>
      client.getVlrPlayerMatches(values.optionalNumber('playerId') ?? 0, {
        page: values.optionalNumber('page'),
      }),
  },

  {
    id: 'getContent',
    group: 'Content',
    path: 'GET /valorant/v1/content',
    params: [optional('locale', 'string', 'de-DE')],
    invoke: (client, values) => client.getContent({ locale: values.optionalText('locale') }),
  },
  {
    id: 'getFeaturedStore',
    group: 'Content',
    path: 'GET /valorant/v2/store-featured',
    params: [],
    invoke: (client) => client.getFeaturedStore(),
  },
  {
    id: 'getStoreOffers',
    group: 'Content',
    path: 'GET /valorant/v2/store-offers',
    params: [],
    invoke: (client) => client.getStoreOffers(),
  },

  {
    id: 'getStatus',
    group: 'Service',
    path: 'GET /valorant/v1/status/{affinity}',
    params: [affinity()],
    invoke: (client, values) => client.getStatus(asAffinity(values)),
  },
  {
    id: 'getQueueStatus',
    group: 'Service',
    path: 'GET /valorant/v1/queue-status/{affinity}',
    params: [affinity()],
    invoke: (client, values) => client.getQueueStatus(asAffinity(values)),
  },
  {
    id: 'getVersion',
    group: 'Service',
    path: 'GET /valorant/v1/version/{affinity}',
    params: [affinity()],
    invoke: (client, values) => client.getVersion(asAffinity(values)),
  },
  {
    id: 'getWebsite',
    group: 'Service',
    path: 'GET /valorant/v1/website/{country_code}',
    params: [
      { name: 'countryCode', required: true, type: 'string', example: 'de-de' },
      optional('category', 'string', 'patch_notes'),
    ],
    invoke: (client, values) =>
      client.getWebsite(values.text('countryCode'), {
        category: values.optionalText('category'),
      }),
  },
  {
    id: 'getWebsiteEntry',
    group: 'Service',
    path: 'GET /valorant/v1/website/{country_code}/{db_id}',
    params: [
      { name: 'countryCode', required: true, type: 'string', example: 'de-de' },
      { name: 'dbId', required: true, type: 'string', example: 'entry id' },
    ],
    invoke: (client, values) =>
      client.getWebsiteEntry(values.text('countryCode'), values.text('dbId')),
  },
  {
    id: 'generateCrosshair',
    group: 'Service',
    path: 'GET /valorant/v1/crosshair/generate',
    params: [optional('id', 'string', '0;P;h;0;f;0;0t;1;0l;4;0o;2;0a;1;0f;0;1b;0')],
    renders: 'image',
    invoke: (client, values) => client.generateCrosshair({ id: values.optionalText('id') }),
  },
  {
    id: 'getWebhookSettings',
    group: 'Premium',
    path: 'GET /public/v1/premium/webhook',
    params: [],
    invoke: (client) => client.getWebhookSettings(),
  },
  {
    id: 'postRaw',
    group: 'Service',
    path: 'POST /valorant/v1/raw',
    params: [
      { name: 'type', required: true, type: 'string', example: 'matchdetails' },
      { name: 'value', required: true, type: 'string', example: 'match uuid' },
      { name: 'region', required: true, type: 'string', example: 'eu' },
      optional('queries', 'string', 'extra query string'),
    ],
    invoke: (client, values) => {
      const payload = {
        type: values.text('type'),
        value: values.text('value'),
        region: values.text('region'),
        ...(values.optionalText('queries') === undefined
          ? {}
          : { queries: values.optionalText('queries') ?? null }),
      };
      return client.postRaw(payload);
    },
  },
];

/**
 * The four premium webhook *mutations* are implemented on the client but left out
 * of this catalog on purpose: the playground lives behind nothing but an
 * unguessable URL, and a leaked URL should not be able to rewrite the account's
 * webhook subscriptions. Only the read is offered here.
 */
export const CATALOG_BY_ID: ReadonlyMap<string, CatalogEntry> = new Map(
  CATALOG.map((entry) => [entry.id, entry]),
);
