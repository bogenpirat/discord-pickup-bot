import { describe, expect, it } from 'vitest';
import { parseServerKey } from '../../../src/domain/wardogs/serverKey.ts';

describe('parseServerKey', () => {
  it('keys a guid with the id| prefix', () => {
    expect(parseServerKey('91052133-1e18-4af8-b54e-499ab279f446')).toBe(
      'id|91052133-1e18-4af8-b54e-499ab279f446',
    );
  });

  it('trims and lower-cases a guid', () => {
    expect(parseServerKey('  91052133-1E18-4AF8-B54E-499AB279F446 ')).toBe(
      'id|91052133-1e18-4af8-b54e-499ab279f446',
    );
  });

  it('accepts a key that already carries the prefix', () => {
    expect(parseServerKey('ID|91052133-1e18-4af8-b54e-499ab279f446')).toBe(
      'id|91052133-1e18-4af8-b54e-499ab279f446',
    );
  });

  it.each(['', 'foo', '89', '682028', 'id|89', '91052133-1e18-4af8-b54e'])(
    'rejects %j',
    (input) => {
      expect(parseServerKey(input)).toBeNull();
    },
  );
});
