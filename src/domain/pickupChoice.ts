import { parseEmoji } from './emoji.ts';

export const PICKUP_CHOICES = ['in', 'later', 'out'] as const;

export type PickupChoice = (typeof PICKUP_CHOICES)[number];

export const isPickupChoice = (value: string): value is PickupChoice =>
  (PICKUP_CHOICES as readonly string[]).includes(value);

export const DEFAULT_CHOICE_EMOJI: Readonly<Record<PickupChoice, string>> = {
  in: '✅',
  later: '🕗',
  out: '❌',
};

export type ChoiceEmojis = Readonly<Record<PickupChoice, string | null>>;

export const NO_CHOICE_EMOJIS: ChoiceEmojis = { in: null, later: null, out: null };

export const emojiFor = (choice: PickupChoice, emojis: ChoiceEmojis): string => {
  const configured = emojis[choice];
  return configured !== null && parseEmoji(configured).ok
    ? configured
    : DEFAULT_CHOICE_EMOJI[choice];
};
