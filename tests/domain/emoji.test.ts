import { describe, expect, it } from 'vitest';
import { parseEmoji } from '../../src/domain/emoji.ts';
import {
  DEFAULT_CHOICE_EMOJI,
  emojiFor,
  NO_CHOICE_EMOJIS,
  PICKUP_CHOICES,
} from '../../src/domain/pickupChoice.ts';

const accepts = (input: string, expected = input.trim()): void => {
  const result = parseEmoji(input);
  if (!result.ok) {
    throw new Error(`expected "${input}" to be accepted, got ${result.error}`);
  }
  expect(result.value).toBe(expected);
};

const rejects = (input: string, error: string): void => {
  const result = parseEmoji(input);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBe(error);
  }
};

describe('unicode emoji', () => {
  it.each(['✅', '❌', '🕗', '🔥', '🎮', '👍', '🇩🇪', '1️⃣', '🏳️‍🌈', '👨‍👩‍👧‍👦', '🤙🏽'])(
    'accepts %s',
    (emoji) => {
      accepts(emoji);
    },
  );

  it('trims surrounding whitespace', () => {
    accepts('  🔥  ', '🔥');
  });
});

describe('custom server emoji', () => {
  it.each([
    '<:valorant:123456789012345678>',
    '<a:spinning:123456789012345678>',
    '<:a_b_2:1234567890123456789>',
  ])('accepts %s', (emoji) => {
    accepts(emoji);
  });

  it.each([
    '<:bad>',
    '<::123456789012345678>',
    '<:name:abc>',
    '<:name:123>',
    ':name:123456789012345678',
    '<:na me:123456789012345678>',
  ])('rejects malformed %s', (value) => {
    rejects(value, 'notAnEmoji');
  });
});

describe('rejections', () => {
  it.each(['', '   '])('rejects blank input', (value) => {
    rejects(value, 'empty');
  });

  it.each(['hello', 'a', '123', ':)', '-', 'ok✅'])('rejects %s as not an emoji', (value) => {
    rejects(value, 'notAnEmoji');
  });

  it('rejects two emoji separated by a space', () => {
    rejects('🔥 🎮', 'notAnEmoji');
  });

  it('rejects an over-long string', () => {
    rejects('🔥'.repeat(64), 'tooLong');
  });

  it('rejects too many code points even when short in characters', () => {
    rejects('❌'.repeat(17), 'tooLong');
  });
});

describe('emojiFor', () => {
  it.each([...PICKUP_CHOICES])('falls back to the default for %s', (choice) => {
    expect(emojiFor(choice, NO_CHOICE_EMOJIS)).toBe(DEFAULT_CHOICE_EMOJI[choice]);
  });

  it('prefers a configured emoji', () => {
    expect(emojiFor('in', { in: '🔥', later: null, out: null })).toBe('🔥');
  });

  it('only overrides the configured choice', () => {
    const emojis = { in: '🔥', later: null, out: null };
    expect(emojiFor('later', emojis)).toBe(DEFAULT_CHOICE_EMOJI.later);
    expect(emojiFor('out', emojis)).toBe(DEFAULT_CHOICE_EMOJI.out);
  });

  it('defines a default for every choice', () => {
    for (const choice of PICKUP_CHOICES) {
      expect(DEFAULT_CHOICE_EMOJI[choice]).toBeTruthy();
    }
  });
});
