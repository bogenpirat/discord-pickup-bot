import { describe, expect, it } from 'vitest';
import {
  parseServerDetailResponse,
  roundElapsedMs,
} from '../../../src/domain/wardogs/parseServerDetail.ts';
import { SAMPLE_LIVE, SAMPLE_RESPONSE } from '../../helpers/wardogs.ts';

describe('parseServerDetailResponse', () => {
  it('reads the live server', () => {
    expect(parseServerDetailResponse(SAMPLE_RESPONSE)).toEqual({
      kind: 'live',
      updatedAt: Temporal.Instant.from('2026-10-24T23:42:18.954Z'),
      linkKey: 'eu-central|asdz-alte-säcke-die-zocken-de-ger',
      server: {
        name: 'ASDZ - Alte Säcke Die Zocken | DE | GER',
        players: 81,
        maxPlayers: 100,
        map: 'Madrid',
        world: 'Europe',
        sky: 'DayClear',
        matchStart: 1792884010275,
        passworded: false,
        imageUrl: 'https://files.catbox.moe/32cmfy.png',
      },
    });
  });

  it('fills the optional fields when they are missing or blank', () => {
    const result = parseServerDetailResponse({
      live: {
        name: 'Official Server',
        players: 99,
        maxPlayers: 100,
        map: 'Detroit',
        world: 'NorthAmerica',
        sky: 'DayLateGray',
        imageUrl: '',
      },
    });
    expect(result).toEqual({
      kind: 'live',
      updatedAt: null,
      linkKey: null,
      server: expect.objectContaining({
        matchStart: null,
        passworded: false,
        imageUrl: null,
      }),
    });
  });

  it('falls back to the live link key when the top-level one is missing', () => {
    const result = parseServerDetailResponse({
      live: { ...SAMPLE_LIVE, linkKey: 'inst|65c46775-287a-4f34-b90f-c69c6b93cce0' },
    });
    expect(result.kind === 'live' && result.linkKey).toBe(
      'inst|65c46775-287a-4f34-b90f-c69c6b93cce0',
    );
  });

  it('ignores an unreadable updatedAt', () => {
    const result = parseServerDetailResponse({ ...SAMPLE_RESPONSE, updatedAt: 'yesterday' });
    expect(result.kind === 'live' && result.updatedAt).toBeNull();
  });

  it.each([null, undefined])('reports a server without live data (%j) as offline', (live) => {
    expect(parseServerDetailResponse({ ...SAMPLE_RESPONSE, live })).toEqual({ kind: 'offline' });
  });

  it.each([
    ['not an object', 'nope'],
    ['a live object missing fields', { live: { name: 'x' } }],
    ['a wrongly typed player count', { live: { ...SAMPLE_LIVE, players: '81' } }],
  ])('rejects %s', (_label, raw) => {
    expect(parseServerDetailResponse(raw)).toEqual({ kind: 'invalid' });
  });
});

describe('roundElapsedMs', () => {
  const start = 1_792_884_010_275;

  it('measures from the round start', () => {
    expect(roundElapsedMs(start, start + 22 * 60_000)).toBe(22 * 60_000);
  });

  it('is null without a start', () => {
    expect(roundElapsedMs(null, start)).toBeNull();
  });

  it('is null for a start in the future', () => {
    expect(roundElapsedMs(start, start - 1)).toBeNull();
  });

  it('is null for a start more than a day old', () => {
    expect(roundElapsedMs(start, start + 24 * 60 * 60_000)).toBe(24 * 60 * 60_000);
    expect(roundElapsedMs(start, start + 24 * 60 * 60_000 + 1)).toBeNull();
  });
});
