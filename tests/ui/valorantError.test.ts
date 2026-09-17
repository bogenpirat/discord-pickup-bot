import { describe, expect, it } from 'vitest';
import { stringsFor } from '../../src/ui/strings.ts';
import { describeValorantError } from '../../src/ui/valorantError.ts';
import type { ValorantError } from '../../src/valorant/http.ts';

const de = stringsFor('de');

describe('describeValorantError', () => {
  it.each([
    ['not-configured', de.valorantNotConfigured],
    ['unauthorized', de.valorantUnauthorized],
    ['rate-limited', de.valorantRateLimited],
    ['not-found', de.valorantApiUnavailable],
    ['network', de.valorantApiUnavailable],
    ['invalid-response', de.valorantApiUnavailable],
  ])('describes %s', (kind, expected) => {
    expect(describeValorantError({ kind } as ValorantError, de)).toBe(expected);
  });

  it('folds an http failure into the generic message', () => {
    const error: ValorantError = { kind: 'http', status: 500, errors: [] };
    expect(describeValorantError(error, de)).toBe(de.valorantApiUnavailable);
  });

  it('translates', () => {
    const en = stringsFor('en');
    expect(describeValorantError({ kind: 'unauthorized' }, en)).toBe(en.valorantUnauthorized);
  });
});
