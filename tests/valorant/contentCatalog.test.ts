import { describe, expect, it } from 'vitest';
import type { ValorantClient } from '../../src/valorant/client.ts';
import { createContentCatalog } from '../../src/valorant/contentCatalog.ts';
import { recordingLogger } from '../helpers/fakes.ts';
import { loadedContentCatalog, SAMPLE_CONTENT } from '../helpers/valorant.ts';

const VANDAL = '9c82e19d-4575-0200-1a81-3eacf00cf872';

interface ContentCall {
  readonly locale: string | undefined;
}

const clientAnswering = (result: unknown, calls: ContentCall[] = []) =>
  ({
    getContent: async (query?: { locale?: string }) => {
      calls.push({ locale: query?.locale });
      return result;
    },
  }) as unknown as ValorantClient;

describe('loading the dump', () => {
  it('asks for German, which is the language the bot answers in', async () => {
    const calls: ContentCall[] = [];
    const catalog = createContentCatalog({
      client: clientAnswering({ ok: true, value: SAMPLE_CONTENT }, calls),
      logger: recordingLogger().logger,
    });

    await catalog.load();

    expect(calls).toEqual([{ locale: 'de-DE' }]);
  });

  it('names ids once it has been loaded, and nothing before', async () => {
    const catalog = createContentCatalog({
      client: clientAnswering({ ok: true, value: SAMPLE_CONTENT }),
      logger: recordingLogger().logger,
    });

    expect(catalog.find(VANDAL)).toBeNull();
    expect(await catalog.load()).toBe(true);
    expect(catalog.find(VANDAL)?.name).toBe('Vandal');
  });

  it('logs the build it read, so a stale dump can be spotted in the log', async () => {
    const logger = recordingLogger();
    const catalog = createContentCatalog({
      client: clientAnswering({ ok: true, value: SAMPLE_CONTENT }),
      logger: logger.logger,
    });

    await catalog.load();

    expect(logger.find('valorant content dump loaded')?.fields).toMatchObject({
      locale: 'de-DE',
      version: 'release-13.05',
      entities: 9,
    });
  });
});

describe('running without a dump', () => {
  it('answers every lookup with null when the call fails', async () => {
    const logger = recordingLogger();
    const catalog = createContentCatalog({
      client: clientAnswering({ ok: false, error: { kind: 'rate-limited' } }),
      logger: logger.logger,
    });

    expect(await catalog.load()).toBe(false);
    expect(catalog.find(VANDAL)).toBeNull();
    expect(catalog.seasonLabel('67e373c7-48f7-b422-641b-079ace30b427')).toBeNull();
    expect(catalog.ceremony('CeremonyFlawless')).toBeNull();
    expect(catalog.namesIn({ weapon: VANDAL }).size).toBe(0);
    expect(logger.find('valorant content dump unavailable')).toBeDefined();
  });

  it('does not try at all when there is no API key behind it', async () => {
    const logger = recordingLogger();
    const catalog = createContentCatalog({ client: null, logger: logger.logger });

    expect(await catalog.load()).toBe(false);
    expect(logger.records).toEqual([]);
  });
});

describe('the catalog surface', () => {
  it('forwards each lookup to the dump it is holding', async () => {
    const catalog = await loadedContentCatalog();

    expect(catalog.find('/Game/Maps/Ascent/Ascent')?.name).toBe('Ascent');
    expect(catalog.findIn('equips', VANDAL)?.name).toBe('Vandal');
    expect(catalog.findIn('maps', VANDAL)).toBeNull();
    expect(catalog.ceremony('CeremonyFlawless')?.name).toBe('MAKELLOS');
    expect(catalog.seasonLabel('67e373c7-48f7-b422-641b-079ace30b427')).toBe('EPISODE 5 · AKT I');
    expect(Object.fromEntries(catalog.namesIn({ weapon: { id: VANDAL } }))).toEqual({
      [VANDAL]: 'Vandal',
    });
  });
});
