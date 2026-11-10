import type { ChoiceEmojis } from './pickupChoice.ts';

/**
 * What a pickup is for. `game` is the original `/valo` call; `cinema` is a movie
 * night called with `/pickup`, which pings its own role, falls back to its own
 * channel and dresses the message up as a cinema showing.
 */
export const PICKUP_THEMES = ['game', 'cinema'] as const;

export type PickupTheme = (typeof PICKUP_THEMES)[number];

export const isPickupTheme = (value: string): value is PickupTheme =>
  (PICKUP_THEMES as readonly string[]).includes(value);

/**
 * A movie night always shows tickets, popcorn and the exit. The per-server
 * emoji settings were picked for the game call, so they do not carry over.
 */
export const CINEMA_CHOICE_EMOJIS: ChoiceEmojis = { in: '🎟️', later: '🍿', out: '🚪' };
