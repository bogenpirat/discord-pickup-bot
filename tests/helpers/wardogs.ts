import type { WardogsClient, WardogsLookupResult } from '../../src/wardogs/client.ts';

/** The `live` object as the API sent it for a real community server. */
export const SAMPLE_LIVE = {
  id: 'e4dee5f9-f2f8-4712-ace6-8de7baa3ecd4',
  region: 'eu-central',
  serverKey: 'id|91052133-1e18-4af8-b54e-499ab279f446',
  slugKey: 'eu-central|asdz-alte-säcke-die-zocken-de-ger',
  rawName: 'ASDZ - Alte Säcke Die Zocken | DE | GER',
  name: 'ASDZ - Alte Säcke Die Zocken | DE | GER',
  official: false,
  joinCode: '91052133-1e18-4af8-b54e-499ab279f446',
  passworded: false,
  players: 81,
  maxPlayers: 100,
  map: 'Madrid',
  world: 'Europe',
  mode: '/Game/GameMechanics/Gamemode/GM_Session.GM_Session_C',
  sky: 'DayClear',
  tags: [],
  imageUrl: 'https://files.catbox.moe/32cmfy.png',
  gameMode: 'KOTH',
  ruleset: 'Default',
  matchStart: 1792884010275,
  scorePeriod: 30,
  maxPing: 0,
  cl: 516586,
  buildConfig: 'Shipping',
  compatibleCl: 516573,
  serverNumber: null,
  reservedSlots: 0,
  reservedCapacity: 0,
  limits: null,
  linkKey: 'eu-central|asdz-alte-säcke-die-zocken-de-ger',
};

export const SAMPLE_RESPONSE = {
  key: 'id|91052133-1e18-4af8-b54e-499ab279f446',
  linkKey: 'eu-central|asdz-alte-säcke-die-zocken-de-ger',
  window: '7d',
  updatedAt: '2026-10-24T23:42:18.954Z',
  live: SAMPLE_LIVE,
};

export interface FakeWardogsClient {
  readonly client: WardogsClient;
  readonly calls: string[];
}

export const fakeWardogsClient = (result: WardogsLookupResult): FakeWardogsClient => {
  const calls: string[] = [];
  return {
    calls,
    client: {
      getServerDetail: async (key) => {
        calls.push(key);
        return result;
      },
    },
  };
};
