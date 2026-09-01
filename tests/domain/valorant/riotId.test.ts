import { describe, expect, it } from 'vitest';
import { formatRiotId, parseRiotId } from '../../../src/domain/valorant/riotId.ts';

describe('parseRiotId', () => {
  it('splits a plain riot id', () => {
    const result = parseRiotId('Bogenpirat#EUW');
    expect(result).toEqual({ ok: true, value: { name: 'Bogenpirat', tag: 'EUW' } });
  });

  it('trims surrounding whitespace and padding around the separator', () => {
    const result = parseRiotId('  Some Name # 1234  ');
    expect(result).toEqual({ ok: true, value: { name: 'Some Name', tag: '1234' } });
  });

  it('drops a leading @ from a mention-style paste', () => {
    expect(parseRiotId('@Name#EUW')).toEqual({ ok: true, value: { name: 'Name', tag: 'EUW' } });
  });

  it('splits on the last hash so a name may contain one', () => {
    expect(parseRiotId('No#1 Player#EUW')).toEqual({
      ok: true,
      value: { name: 'No#1 Player', tag: 'EUW' },
    });
  });

  it('keeps non-ascii names intact', () => {
    expect(parseRiotId('Müller#DE1')).toEqual({ ok: true, value: { name: 'Müller', tag: 'DE1' } });
  });

  it('rejects an id without a tag', () => {
    expect(parseRiotId('Bogenpirat')).toEqual({ ok: false, error: 'missing-tag' });
  });

  it('rejects an empty name', () => {
    expect(parseRiotId('#EUW')).toEqual({ ok: false, error: 'empty-name' });
  });

  it('rejects a name over sixteen characters', () => {
    expect(parseRiotId(`${'a'.repeat(17)}#EUW`)).toEqual({ ok: false, error: 'name-too-long' });
  });

  it('accepts a name of exactly sixteen characters', () => {
    expect(parseRiotId(`${'a'.repeat(16)}#EUW`).ok).toBe(true);
  });

  it('counts astral characters once, not twice', () => {
    // Sixteen emoji are sixteen characters to a person and thirty-two to `.length`.
    expect(parseRiotId(`${'🐍'.repeat(16)}#EUW`).ok).toBe(true);
  });

  it.each(['ab', 'abcdef', 'eu-w', ''])('rejects the invalid tag %j', (tag) => {
    expect(parseRiotId(`Name#${tag}`)).toEqual({ ok: false, error: 'invalid-tag' });
  });

  it('accepts tags of three to five alphanumerics', () => {
    for (const tag of ['abc', 'abcd', 'abcde', '123', 'EU1']) {
      expect(parseRiotId(`Name#${tag}`).ok).toBe(true);
    }
  });
});

describe('formatRiotId', () => {
  it('renders the canonical form', () => {
    expect(formatRiotId({ name: 'Bogenpirat', tag: 'EUW' })).toBe('Bogenpirat#EUW');
  });
});
