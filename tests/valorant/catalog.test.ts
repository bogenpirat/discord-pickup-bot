import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_BY_ID, type ParamValues } from '../../src/valorant/catalog.ts';
import type { ValorantClient } from '../../src/valorant/client.ts';

/** Supplies every parameter, so an entry's `invoke` runs its full argument list. */
const filledValues = (): ParamValues => ({
  text: (name) => `<${name}>`,
  optionalText: (name) => `<${name}>`,
  optionalNumber: () => 1,
  optionalBoolean: () => true,
});

/** Supplies nothing, so every optional argument collapses to undefined. */
const emptyValues = (): ParamValues => ({
  text: (name) => `<${name}>`,
  optionalText: () => undefined,
  optionalNumber: () => undefined,
  optionalBoolean: () => undefined,
});

const recordingClient = () => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const client = new Proxy(
    {},
    {
      get:
        (_target, property: string) =>
        async (...args: readonly unknown[]) => {
          calls.push({ method: property, args });
          return { ok: true, value: null };
        },
    },
  ) as ValorantClient;
  return { client, calls };
};

describe('the catalog', () => {
  it('gives every entry a unique id', () => {
    const ids = CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('indexes every entry by its id', () => {
    expect(CATALOG_BY_ID.size).toBe(CATALOG.length);
    for (const entry of CATALOG) {
      expect(CATALOG_BY_ID.get(entry.id)).toBe(entry);
    }
  });

  it('names a group and an upstream path for every entry', () => {
    for (const entry of CATALOG) {
      expect(entry.group, entry.id).not.toBe('');
      expect(entry.path, entry.id).toMatch(/^(GET|POST) \//);
    }
  });

  it('gives every parameter a unique name within its entry', () => {
    for (const entry of CATALOG) {
      const names = entry.params.map((param) => param.name);
      expect(new Set(names).size, entry.id).toBe(names.length);
    }
  });

  it('lists required parameters before optional ones, so forms read top down', () => {
    for (const entry of CATALOG) {
      const firstOptional = entry.params.findIndex((param) => !param.required);
      const lastRequired = entry.params.map((param) => param.required).lastIndexOf(true);
      if (firstOptional !== -1 && lastRequired !== -1) {
        expect(lastRequired, entry.id).toBeLessThan(firstOptional);
      }
    }
  });

  it('offers an example or a set of options for every parameter', () => {
    for (const entry of CATALOG) {
      for (const param of entry.params) {
        const described =
          param.example !== undefined || param.options !== undefined || param.type === 'boolean';
        expect(described, `${entry.id}.${param.name}`).toBe(true);
      }
    }
  });

  it('lists an example that is itself one of the offered options', () => {
    for (const entry of CATALOG) {
      for (const param of entry.params) {
        if (param.options !== undefined && param.example !== undefined) {
          expect(param.options, `${entry.id}.${param.name}`).toContain(param.example);
        }
      }
    }
  });

  // Regression guard: this is the whole reason the catalog exists rather than a
  // hand-written switch, and it is the one thing a typo would break silently.
  it('calls a real client method for every entry', async () => {
    for (const entry of CATALOG) {
      const spy = recordingClient();
      await entry.invoke(spy.client, filledValues());

      expect(spy.calls, entry.id).toHaveLength(1);
      expect(typeof spy.calls[0]?.method, entry.id).toBe('string');
    }
  });

  it('reaches the same method whether or not the optional values are given', async () => {
    for (const entry of CATALOG) {
      const filled = recordingClient();
      const empty = recordingClient();

      await entry.invoke(filled.client, filledValues());
      await entry.invoke(empty.client, emptyValues());

      expect(empty.calls[0]?.method, entry.id).toBe(filled.calls[0]?.method);
    }
  });

  it('only ever names methods the client actually exposes', async () => {
    // The proxy above answers anything, so the names are checked against the
    // real client's shape instead.
    const seen = new Set<string>();
    for (const entry of CATALOG) {
      const spy = recordingClient();
      await entry.invoke(spy.client, filledValues());
      const method = spy.calls[0]?.method;
      if (method !== undefined) {
        seen.add(method);
      }
    }

    const declared: readonly (keyof ValorantClient)[] = [
      'getAccount',
      'getAccountByPuuid',
      'getMmr',
      'getMmrByPuuid',
      'getMmrHistory',
      'getMmrHistoryByPuuid',
      'getMatches',
      'getMatchesByPuuid',
      'getMatch',
      'getStoredMatches',
      'getStoredMatchesByPuuid',
      'getStoredMmrHistory',
      'getStoredMmrHistoryByPuuid',
      'getLeaderboard',
      'searchPremierTeams',
      'getPremierLeaderboard',
      'getPremierTeam',
      'getPremierTeamById',
      'getPremierTeamHistory',
      'getPremierTeamHistoryById',
      'getEsportsSchedule',
      'getVlrEvents',
      'getVlrEventMatches',
      'getVlrMatch',
      'getVlrTeam',
      'getVlrTeamMatches',
      'getVlrTeamTransactions',
      'getVlrPlayer',
      'getVlrPlayerMatches',
      'getContent',
      'getFeaturedStore',
      'getStoreOffers',
      'getStatus',
      'getQueueStatus',
      'getVersion',
      'getWebsite',
      'getWebsiteEntry',
      'generateCrosshair',
      'postRaw',
      'getWebhookSettings',
    ];

    for (const method of seen) {
      expect(declared, method).toContain(method);
    }
  });

  // A leaked playground URL must not be able to rewrite webhook subscriptions.
  it('leaves the mutating premium endpoints out', () => {
    const ids = CATALOG.map((entry) => entry.id);

    expect(ids).not.toContain('addWebhookUser');
    expect(ids).not.toContain('updateWebhookUser');
    expect(ids).not.toContain('deleteWebhookUser');
  });

  it('marks the crosshair endpoint as an image', () => {
    expect(CATALOG_BY_ID.get('generateCrosshair')?.renders).toBe('image');
    expect(CATALOG_BY_ID.get('getAccount')?.renders).toBeUndefined();
  });
});
