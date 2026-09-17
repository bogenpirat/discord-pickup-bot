import { parseAppDetailsResponse, type SteamParseResult } from '../domain/steam/parseAppDetails.ts';
import { parseSteamReleaseTimestamp } from '../domain/steam/parseReleaseTimestamp.ts';

export type SteamLookupResult = SteamParseResult | { readonly kind: 'error' };

export interface FetchResponseLike {
  readonly ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers: Record<string, string> },
) => Promise<FetchResponseLike>;

/** Lets the store page render for age-gated apps instead of redirecting to the check. */
const AGE_GATE_HEADERS = {
  Cookie: 'birthtime=0; lastagecheckage=1-January-1980; wants_mature_content=1',
};

export interface SteamClient {
  getAppDetails(appId: number): Promise<SteamLookupResult>;
  /** Best-effort exact release instant; null whenever the store page cannot supply one. */
  getReleaseTimestamp(appId: number): Promise<Temporal.Instant | null>;
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
  getReleaseTimestamp: async (appId) => {
    try {
      const response = await fetchImpl(
        `https://store.steampowered.com/app/${appId}/?cc=de&l=english`,
        { headers: AGE_GATE_HEADERS },
      );
      if (!response.ok) {
        return null;
      }
      return parseSteamReleaseTimestamp(await response.text());
    } catch {
      return null;
    }
  },
});
