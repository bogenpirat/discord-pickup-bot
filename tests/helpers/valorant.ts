import type { ValorantClient, ValorantResult, ValorantStats } from '../../src/valorant/client.ts';
import type { Account, GameVersion, Mmr, MmrHistory } from '../../src/valorant/types.ts';

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
    stats: () => ({ ...DEFAULT_STATS, ...options.stats }),
  };

  return { client: client as unknown as ValorantClient, calls };
};
