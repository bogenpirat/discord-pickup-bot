import { isPickupChoice, type PickupChoice } from '../domain/pickupChoice.ts';
import { err, ok, type Result } from '../lib/result.ts';

export const CUSTOM_ID_NAMESPACE = 'pickup';

export type CustomIdAction =
  | { readonly action: 'respond'; readonly choice: PickupChoice; readonly pickupId: number }
  | { readonly action: 'close'; readonly pickupId: number };

export type CustomIdError = 'foreignNamespace' | 'unknownAction' | 'malformed';

export const encodeRespond = (choice: PickupChoice, pickupId: number): string =>
  `${CUSTOM_ID_NAMESPACE}:respond:${choice}:${pickupId}`;

export const encodeClose = (pickupId: number): string => `${CUSTOM_ID_NAMESPACE}:close:${pickupId}`;

const parsePickupId = (raw: string | undefined): number | undefined => {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  return Number(raw);
};

export const decodeCustomId = (customId: string): Result<CustomIdAction, CustomIdError> => {
  const parts = customId.split(':');

  if (parts[0] !== CUSTOM_ID_NAMESPACE) {
    return err('foreignNamespace');
  }

  if (parts[1] === 'respond') {
    if (parts.length !== 4) {
      return err('malformed');
    }
    const choice = parts[2] ?? '';
    const pickupId = parsePickupId(parts[3]);
    if (!isPickupChoice(choice) || pickupId === undefined) {
      return err('malformed');
    }
    return ok({ action: 'respond', choice, pickupId });
  }

  if (parts[1] === 'close') {
    if (parts.length !== 3) {
      return err('malformed');
    }
    const pickupId = parsePickupId(parts[2]);
    if (pickupId === undefined) {
      return err('malformed');
    }
    return ok({ action: 'close', pickupId });
  }

  return err('unknownAction');
};
