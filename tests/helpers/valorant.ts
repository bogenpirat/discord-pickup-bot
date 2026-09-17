import type { ContentInput } from '../../src/domain/valorant/content.ts';
import type { ValorantClient, ValorantResult, ValorantStats } from '../../src/valorant/client.ts';
import { type ContentCatalog, createContentCatalog } from '../../src/valorant/contentCatalog.ts';
import type {
  Account,
  Content,
  GameVersion,
  Match,
  Mmr,
  MmrHistory,
} from '../../src/valorant/types.ts';
import { silentLogger } from './fakes.ts';

/** Records which client method a command reached for, and with what. */
export type ValorantCall = readonly [method: string, ...args: unknown[]];

export interface FakeValorantClient {
  readonly client: ValorantClient;
  readonly calls: ValorantCall[];
}

export interface FakeValorantOptions {
  readonly account?: ValorantResult<Account>;
  readonly accountByPuuid?: ValorantResult<Account>;
  readonly version?: ValorantResult<GameVersion>;
  readonly mmr?: ValorantResult<Mmr>;
  readonly mmrHistory?: ValorantResult<MmrHistory>;
  readonly matches?: ValorantResult<readonly Match[]>;
  readonly content?: ValorantResult<Content>;
  readonly stats?: Partial<ValorantStats>;
}

const notStubbed = <T>(): ValorantResult<T> => ({ ok: false, error: { kind: 'network' } });

const DEFAULT_STATS: ValorantStats = {
  used: 0,
  limit: 30,
  waiting: 0,
  blockedUntil: null,
  requests: 0,
  failures: 0,
  rateLimitHits: 0,
  lastRateLimitedAt: null,
};

/**
 * Only the handful of methods the commands actually call are stubbed; the rest
 * are absent, so a command that starts using one fails loudly instead of
 * quietly reading a default.
 */
export const fakeValorantClient = (options: FakeValorantOptions): FakeValorantClient => {
  const calls: ValorantCall[] = [];

  const client = {
    getAccount: async (name: string, tag: string) => {
      calls.push(['getAccount', name, tag]);
      return options.account ?? notStubbed<Account>();
    },
    getAccountByPuuid: async (puuid: string) => {
      calls.push(['getAccountByPuuid', puuid]);
      return options.accountByPuuid ?? notStubbed<Account>();
    },
    getVersion: async (affinity: string) => {
      calls.push(['getVersion', affinity]);
      return options.version ?? notStubbed<GameVersion>();
    },
    getMmr: async (...args: readonly unknown[]) => {
      calls.push(['getMmr', ...args]);
      return options.mmr ?? notStubbed<Mmr>();
    },
    getMmrHistory: async (...args: readonly unknown[]) => {
      calls.push(['getMmrHistory', ...args]);
      return options.mmrHistory ?? notStubbed<MmrHistory>();
    },
    getMatchesByPuuid: async (...args: readonly unknown[]) => {
      calls.push(['getMatchesByPuuid', ...args]);
      return options.matches ?? notStubbed<readonly Match[]>();
    },
    getContent: async (...args: readonly unknown[]) => {
      calls.push(['getContent', ...args]);
      return options.content ?? notStubbed<Content>();
    },
    stats: () => ({ ...DEFAULT_STATS, ...options.stats }),
  };

  return { client: client as unknown as ValorantClient, calls };
};

/**
 * A hand-cut content dump. Every entry is copied from a real answer, including
 * the asset paths and the act hierarchy, because those are the parts the index
 * has to get right and the parts the generated schema does not describe.
 */
export const SAMPLE_CONTENT: ContentInput = {
  version: 'release-13.05',
  characters: [
    {
      id: '569fdd95-4d10-43ab-ca70-79becc718b46',
      name: 'Sage',
      assetName: 'Default__Pandemic_PrimaryAsset_C',
      assetPath: null,
    },
  ],
  maps: [
    {
      id: '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319',
      name: 'Ascent',
      assetName: 'Ascent',
      assetPath: '/Game/Maps/Ascent/Ascent',
    },
  ],
  equips: [
    {
      id: '9c82e19d-4575-0200-1a81-3eacf00cf872',
      name: 'Vandal',
      assetName: 'Default__Rifle_Vandal_PrimaryAsset_C',
      assetPath: null,
    },
  ],
  playerCards: [
    {
      id: 'e9a3d874-4893-b17a-00ca-0b88017f7919',
      name: 'Banner „Neo Frontier“',
      assetName: 'Default__Playercard_NeoFrontier_PrimaryAsset_C',
      assetPath: null,
    },
  ],
  playerTitles: [
    {
      id: '6b4e1d0c-410e-878b-f151-9b8a8abc83a3',
      name: 'Titel „Pookie“',
      assetName: 'Default__PlayerTitle_Pookie_PrimaryAsset_C',
      assetPath: null,
    },
  ],
  ceremonies: [
    {
      id: 'eb651c62-421f-98fc-8008-68bee9ec942d',
      name: 'MAKELLOS',
      assetName: 'Default__FlawlessCeremony_PrimaryAsset_C',
      assetPath: null,
    },
  ],
  gameModes: [
    {
      id: '96bd3920-4f36-d026-2b28-c683eb0bcac5',
      name: 'Standard',
      assetName: 'BombGameMode',
      assetPath: '/Game/GameModes/Bomb/BombGameMode.BombGameMode_C',
    },
  ],
  acts: [
    {
      id: 'fcf2c8f4-4324-e50b-2e23-718e4a3ab046',
      name: 'EPISODE 5',
      parentId: '00000000-0000-0000-0000-000000000000',
      type: 'episode',
    },
    {
      id: '67e373c7-48f7-b422-641b-079ace30b427',
      name: 'AKT I',
      parentId: 'fcf2c8f4-4324-e50b-2e23-718e4a3ab046',
      type: 'act',
    },
  ],
};

/** A catalog that has already read {@link SAMPLE_CONTENT}, or a dump of your own. */
export const loadedContentCatalog = async (
  content: ContentInput = SAMPLE_CONTENT,
): Promise<ContentCatalog> => {
  const client = {
    getContent: async () => ({ ok: true, value: content }),
  } as unknown as ValorantClient;

  const catalog = createContentCatalog({ client, logger: silentLogger() });
  await catalog.load();
  return catalog;
};

/** A catalog that never read a dump, which is what every lookup falls back to. */
export const emptyContentCatalog = (): ContentCatalog =>
  createContentCatalog({ client: null, logger: silentLogger() });
