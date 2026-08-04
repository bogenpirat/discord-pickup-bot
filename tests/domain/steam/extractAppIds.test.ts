import { describe, expect, it } from 'vitest';
import { extractSteamAppIds } from '../../../src/domain/steam/extractAppIds.ts';

describe('extractSteamAppIds', () => {
  it('extracts a single app id from a store link', () => {
    expect(
      extractSteamAppIds('check this out https://store.steampowered.com/app/1245620/'),
    ).toEqual([1245620]);
  });

  it('extracts multiple distinct app ids', () => {
    const content =
      'https://store.steampowered.com/app/1245620/ELDEN_RING/ and https://store.steampowered.com/app/1091500/Cyberpunk_2077/';
    expect(extractSteamAppIds(content)).toEqual([1245620, 1091500]);
  });

  it('dedupes repeated links to the same app', () => {
    const content =
      'https://store.steampowered.com/app/1245620/ELDEN_RING/ again: https://store.steampowered.com/app/1245620/ELDEN_RING/';
    expect(extractSteamAppIds(content)).toEqual([1245620]);
  });

  it('ignores non-matching text and other urls', () => {
    expect(extractSteamAppIds('no links here, https://example.com/app/123')).toEqual([]);
  });

  it('caps extraction at 5 links per message', () => {
    const content = Array.from(
      { length: 8 },
      (_, i) => `https://store.steampowered.com/app/${1000 + i}/game/`,
    ).join(' ');
    expect(extractSteamAppIds(content)).toHaveLength(5);
  });

  it('matches without protocol scheme casing constraints', () => {
    expect(extractSteamAppIds('HTTPS://STORE.STEAMPOWERED.COM/app/42/')).toEqual([42]);
  });
});
