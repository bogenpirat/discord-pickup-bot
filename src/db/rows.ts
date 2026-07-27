export type SqlRow = Record<string, unknown>;

export const asText = (value: unknown): string =>
  typeof value === 'string' ? value : String(value);

export const asNullableText = (value: unknown): string | null =>
  value === null || value === undefined ? null : asText(value);

export const asNumber = (value: unknown): number => Number(value);

export const asNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : asNumber(value);
