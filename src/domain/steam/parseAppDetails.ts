import { z } from 'zod';

export interface SteamAppDetails {
  readonly appId: number;
  readonly name: string;
  readonly headerImage: string;
  readonly comingSoon: boolean;
  readonly releaseDateText: string;
  readonly price: { readonly currency: string; readonly finalFormatted: string } | null;
  readonly storeUrl: string;
}

export type SteamParseResult =
  | { readonly kind: 'found'; readonly details: SteamAppDetails }
  | { readonly kind: 'invalid' };

const priceOverviewSchema = z.object({
  currency: z.string(),
  final_formatted: z.string(),
});

const releaseDateSchema = z.object({
  coming_soon: z.boolean(),
  date: z.string(),
});

const appDataSchema = z.object({
  name: z.string(),
  header_image: z.string(),
  release_date: releaseDateSchema,
  price_overview: priceOverviewSchema.optional(),
});

const entrySchema = z.union([
  z.object({ success: z.literal(true), data: appDataSchema }),
  z.object({ success: z.literal(false) }),
]);

const responseSchema = z.record(z.string(), z.unknown());

export const parseAppDetailsResponse = (raw: unknown, appId: number): SteamParseResult => {
  const record = responseSchema.safeParse(raw);
  if (!record.success) {
    return { kind: 'invalid' };
  }

  const parsed = entrySchema.safeParse(record.data[String(appId)]);
  if (!parsed.success || !parsed.data.success) {
    return { kind: 'invalid' };
  }

  const data = parsed.data.data;

  return {
    kind: 'found',
    details: {
      appId,
      name: data.name,
      headerImage: data.header_image,
      comingSoon: data.release_date.coming_soon,
      releaseDateText: data.release_date.date,
      price:
        data.price_overview === undefined
          ? null
          : {
              currency: data.price_overview.currency,
              finalFormatted: data.price_overview.final_formatted,
            },
      storeUrl: `https://store.steampowered.com/app/${appId}`,
    },
  };
};
