import { parseAppDetailsResponse, type SteamParseResult } from '../domain/steam/parseAppDetails.ts';

export type SteamLookupResult = SteamParseResult | { readonly kind: 'error' };

export type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface SteamClient {
  getAppDetails(appId: number): Promise<SteamLookupResult>;
}

export const createSteamClient = (fetchImpl: FetchLike = fetch): SteamClient => ({
  getAppDetails: async (appId) => {
    try {
      const response = await fetchImpl(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=de&l=en`,
      );
      if (!response.ok) {
        return { kind: 'error' };
      }
      return parseAppDetailsResponse(await response.json(), appId);
    } catch {
      return { kind: 'error' };
    }
  },
});
