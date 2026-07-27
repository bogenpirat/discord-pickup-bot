import { err, ok, type Result } from '../lib/result.ts';

const CUSTOM_EMOJI = /^<a?:[a-zA-Z0-9_]{2,32}:\d{17,20}>$/;
const KEYCAP = '⃣';
const CONTAINS_EMOJI = new RegExp(
  `\\p{Extended_Pictographic}|\\p{Regional_Indicator}|${KEYCAP}`,
  'u',
);
const CONTAINS_LETTER = /[a-zA-Z]/;
const MAX_LENGTH = 64;
const MAX_CODE_POINTS = 16;

export type EmojiError = 'empty' | 'tooLong' | 'notAnEmoji';

export const parseEmoji = (input: string): Result<string, EmojiError> => {
  const value = input.trim();

  if (value === '') {
    return err('empty');
  }
  if (value.length > MAX_LENGTH) {
    return err('tooLong');
  }
  if (CUSTOM_EMOJI.test(value)) {
    return ok(value);
  }
  if (/\s/.test(value) || CONTAINS_LETTER.test(value) || !CONTAINS_EMOJI.test(value)) {
    return err('notAnEmoji');
  }
  if ([...value].length > MAX_CODE_POINTS) {
    return err('tooLong');
  }

  return ok(value);
};
