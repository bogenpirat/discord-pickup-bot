import { describe, expect, it } from 'vitest';
import type { SteamAppDetails } from '../../src/domain/steam/parseAppDetails.ts';
import { renderSteamReleaseMessage } from '../../src/ui/steamAnnouncement.ts';

const details = (overrides: Partial<SteamAppDetails> = {}): SteamAppDetails => ({
  appId: 1245620,
  name: 'ELDEN RING',
  headerImage: 'https://cdn.example.com/header.jpg',
  comingSoon: false,
  releaseDateText: '24 Feb, 2022',
  price: null,
  storeUrl: 'https://store.steampowered.com/app/1245620',
  ...overrides,
});

describe('renderSteamReleaseMessage', () => {
  it('builds an embed with title, url and image', () => {
    const payload = renderSteamReleaseMessage(details());
    const embed = payload.embeds[0]?.toJSON();

    expect(embed?.title).toBe('ELDEN RING');
    expect(embed?.url).toBe('https://store.steampowered.com/app/1245620');
    expect(embed?.image?.url).toBe('https://cdn.example.com/header.jpg');
  });

  it('includes a price field when a price is available', () => {
    const payload = renderSteamReleaseMessage(
      details({ price: { currency: 'EUR', finalFormatted: '59,99€' } }),
    );
    const embed = payload.embeds[0]?.toJSON();

    expect(embed?.fields).toEqual([{ name: 'Preis', value: '59,99€', inline: true }]);
  });

  it('omits the price field when no price is available', () => {
    const payload = renderSteamReleaseMessage(details({ price: null }));
    const embed = payload.embeds[0]?.toJSON();

    expect(embed?.fields ?? []).toEqual([]);
  });

  it('never allows mentions', () => {
    const payload = renderSteamReleaseMessage(details());
    expect(payload.allowedMentions).toEqual({ parse: [], roles: [] });
  });

  it('mentions the game name in the content comment', () => {
    const payload = renderSteamReleaseMessage(details({ name: 'Half-Life 3' }));
    expect(payload.content).toContain('Half-Life 3');
  });

  it('uses english strings for the en locale', () => {
    const payload = renderSteamReleaseMessage(
      details({ price: { currency: 'EUR', finalFormatted: '59,99€' } }),
      'en',
    );
    const embed = payload.embeds[0]?.toJSON();
    expect(embed?.fields).toEqual([{ name: 'Price', value: '59,99€', inline: true }]);
    expect(payload.content).toContain('is now available');
  });
});
