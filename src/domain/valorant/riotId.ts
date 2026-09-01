import { err, ok, type Result } from '../../lib/result.ts';

export interface RiotId {
  readonly name: string;
  readonly tag: string;
}

export type RiotIdProblem = 'missing-tag' | 'empty-name' | 'name-too-long' | 'invalid-tag';

const MAX_NAME_LENGTH = 16;
const TAG_PATTERN = /^[a-z0-9]{3,5}$/i;

/**
 * Accepts what people actually paste: `Name#Tag`, a stray leading `@` from a
 * mention-style copy, and surrounding whitespace. The split is on the *last* `#`
 * because a Riot name may itself contain one while a tag never does.
 */
export const parseRiotId = (input: string): Result<RiotId, RiotIdProblem> => {
  const trimmed = input.trim().replace(/^@+/, '').trim();
  const separator = trimmed.lastIndexOf('#');

  if (separator === -1) {
    return err('missing-tag');
  }

  const name = trimmed.slice(0, separator).trim();
  const tag = trimmed.slice(separator + 1).trim();

  if (name === '') {
    return err('empty-name');
  }
  if ([...name].length > MAX_NAME_LENGTH) {
    return err('name-too-long');
  }
  if (!TAG_PATTERN.test(tag)) {
    return err('invalid-tag');
  }

  return ok({ name, tag });
};

/** The canonical `Name#Tag` rendering used in replies and log lines. */
export const formatRiotId = (id: RiotId): string => `${id.name}#${id.tag}`;
