import { describe, expect, it } from 'vitest';
import {
  createSteamClient,
  type FetchLike,
  type FetchResponseLike,
} from '../../src/steam/client.ts';

const APP_ID = 1245620;

/** Fills in whichever body accessor a given test does not care about. */
const fakeFetch =
  (impl: (url: string) => Promise<Partial<FetchResponseLike> & { ok: boolean }>): FetchLike =>
  async (url) => {
    const response = await impl(url);
    return {
      ok: response.ok,
      json: response.json ?? (async () => ({})),
      text: response.text ?? (async () => ''),
    };
  };

describe('createSteamClient', () => {
  it('returns found for a successful response', async () => {
    const client = createSteamClient(
      fakeFetch(async () => ({
        ok: true,
        json: async () => ({
          [APP_ID]: {
            success: true,
            data: {
              name: 'ELDEN RING',
              header_image: 'https://cdn.example.com/header.jpg',
              release_date: { coming_soon: false, date: '24 Feb, 2022' },
            },
          },
        }),
      })),
    );

    const result = await client.getAppDetails(APP_ID);
    expect(result.kind).toBe('found');
  });

  it('returns invalid for an explicit success:false response', async () => {
    const client = createSteamClient(
      fakeFetch(async () => ({ ok: true, json: async () => ({ [APP_ID]: { success: false } }) })),
    );

    expect((await client.getAppDetails(APP_ID)).kind).toBe('invalid');
  });

  it('returns error for a non-ok HTTP status', async () => {
    const client = createSteamClient(
      fakeFetch(async () => ({ ok: false, json: async () => ({}) })),
    );

    expect((await client.getAppDetails(APP_ID)).kind).toBe('error');
  });

  it('returns error when the fetch itself throws', async () => {
    const client = createSteamClient(
      fakeFetch(async () => {
        throw new Error('network down');
      }),
    );

    expect((await client.getAppDetails(APP_ID)).kind).toBe('error');
  });

  it('returns error when the response body cannot be parsed as json', async () => {
    const client = createSteamClient(
      fakeFetch(async () => ({
        ok: true,
        json: async () => {
          throw new Error('invalid json');
        },
      })),
    );

    expect((await client.getAppDetails(APP_ID)).kind).toBe('error');
  });

  it('requests the expected url with the german region', async () => {
    let requestedUrl = '';
    const client = createSteamClient(
      fakeFetch(async (url) => {
        requestedUrl = url;
        return { ok: true, json: async () => ({ [APP_ID]: { success: false } }) };
      }),
    );

    await client.getAppDetails(APP_ID);
    expect(requestedUrl).toBe(
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}&cc=de&l=en`,
    );
  });
});
