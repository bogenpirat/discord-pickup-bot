export const PICKUP_CHOICES = ['in', 'later', 'out'] as const;

export type PickupChoice = (typeof PICKUP_CHOICES)[number];

export const isPickupChoice = (value: string): value is PickupChoice =>
  (PICKUP_CHOICES as readonly string[]).includes(value);
