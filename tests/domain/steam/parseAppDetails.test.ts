import { describe, expect, it } from 'vitest';
import { parseAppDetailsResponse } from '../../../src/domain/steam/parseAppDetails.ts';

const APP_ID = 1245620;

describe('parseAppDetailsResponse', () => {
  it('parses a successful response with a price', () => {
    const raw = {
      [APP_ID]: {
        success: true,
        data: {
          name: 'ELDEN RING',
          header_image: 'https://cdn.example.com/1245620/header.jpg',
          release_date: { coming_soon: false, date: '24 Feb, 2022' },
          price_overview: { currency: 'EUR', final_formatted: '59,99€' },
        },
      },
    };

    expect(parseAppDetailsResponse(raw, APP_ID)).toEqual({
      kind: 'found',
      details: {
        appId: APP_ID,
        name: 'ELDEN RING',
        headerImage: 'https://cdn.example.com/1245620/header.jpg',
        comingSoon: false,
        releaseDateText: '24 Feb, 2022',
        price: { currency: 'EUR', finalFormatted: '59,99€' },
        storeUrl: `https://store.steampowered.com/app/${APP_ID}`,
      },
    });
  });

  it('parses a successful response without a price', () => {
    const raw = {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Some Upcoming Game',
          header_image: 'https://cdn.example.com/header.jpg',
          release_date: { coming_soon: true, date: 'Q2 2026' },
        },
      },
    };

    const result = parseAppDetailsResponse(raw, APP_ID);
    expect(result.kind).toBe('found');
    expect(result.kind === 'found' && result.details.price).toBeNull();
  });

  it('treats an explicit success:false as invalid', () => {
    const raw = { [APP_ID]: { success: false } };
    expect(parseAppDetailsResponse(raw, APP_ID)).toEqual({ kind: 'invalid' });
  });

  it('treats a missing entry for the requested app id as invalid', () => {
    expect(parseAppDetailsResponse({}, APP_ID)).toEqual({ kind: 'invalid' });
  });

  it('finds the entry by steam_appid when Steam keys it under an alias id', () => {
    const raw = {
      5255670: {
        success: true,
        data: {
          steam_appid: 4954910,
          name: 'Scam With Your Friends',
          header_image: 'https://cdn.example.com/4954910/header.jpg',
          release_date: { coming_soon: true, date: '5 Nov, 2026' },
        },
      },
    };

    const result = parseAppDetailsResponse(raw, 4954910);
    expect(result.kind).toBe('found');
    expect(result.kind === 'found' && result.details).toMatchObject({
      appId: 4954910,
      name: 'Scam With Your Friends',
      comingSoon: true,
      storeUrl: 'https://store.steampowered.com/app/4954910',
    });
  });

  it('ignores an entry under another key whose steam_appid does not match', () => {
    const raw = {
      999: {
        success: true,
        data: {
          steam_appid: 999,
          name: 'Other Game',
          header_image: 'https://cdn.example.com/header.jpg',
          release_date: { coming_soon: true, date: 'Q2 2026' },
        },
      },
    };
    expect(parseAppDetailsResponse(raw, APP_ID)).toEqual({ kind: 'invalid' });
  });

  it('treats a malformed top-level shape as invalid', () => {
    expect(parseAppDetailsResponse('not an object', APP_ID)).toEqual({ kind: 'invalid' });
    expect(parseAppDetailsResponse(null, APP_ID)).toEqual({ kind: 'invalid' });
  });

  it('treats a success:true entry missing required fields as invalid', () => {
    const raw = { [APP_ID]: { success: true, data: { name: 'Missing Fields' } } };
    expect(parseAppDetailsResponse(raw, APP_ID)).toEqual({ kind: 'invalid' });
  });
});
