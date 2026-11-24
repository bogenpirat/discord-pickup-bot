import { PICKUP_CHOICES, type PickupChoice } from './pickupChoice.ts';

/**
 * What a pickup is for. `game` is the `/valo` call (alias `/pickup`); `cinema`
 * is a movie night called with `/cinema`, which pings its own role, falls back to its own
 * channel and dresses the message up as a cinema showing.
 */
export const PICKUP_THEMES = ['game', 'cinema'] as const;

export type PickupTheme = (typeof PICKUP_THEMES)[number];

export const isPickupTheme = (value: string): value is PickupTheme =>
  (PICKUP_THEMES as readonly string[]).includes(value);

/** A film starts when it starts, so a movie night has no "running late". */
export const CINEMA_CHOICES = ['in', 'out'] as const satisfies readonly PickupChoice[];

export type CinemaChoice = (typeof CINEMA_CHOICES)[number];

/** The answers a pickup of this theme offers, in the order its buttons show them. */
export const choicesFor = (theme: PickupTheme): readonly PickupChoice[] =>
  theme === 'cinema' ? CINEMA_CHOICES : PICKUP_CHOICES;

/**
 * A movie night always shows tickets and the exit. The per-server emoji
 * settings were picked for the game call, so they do not carry over.
 */
export const CINEMA_CHOICE_EMOJIS: Readonly<Record<CinemaChoice, string>> = {
  in: '🎟️',
  out: '🚪',
};
