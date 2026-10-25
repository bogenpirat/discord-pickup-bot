import { describe, expect, it } from 'vitest';
import { parseServerRef } from '../../../src/domain/wardogs/serverRef.ts';

describe('parseServerRef', () => {
  it('keys a guid with the id| prefix', () => {
    expect(parseServerRef('91052133-1e18-4af8-b54e-499ab279f446')).toEqual({
      param: 'key',
      value: 'id|91052133-1e18-4af8-b54e-499ab279f446',
    });
  });

  it('trims and lower-cases a guid', () => {
    expect(parseServerRef('  91052133-1E18-4AF8-B54E-499AB279F446 ')).toEqual({
      param: 'key',
      value: 'id|91052133-1e18-4af8-b54e-499ab279f446',
    });
  });

  it('accepts a key that already carries the prefix', () => {
    expect(parseServerRef('ID|91052133-1e18-4af8-b54e-499ab279f446')).toEqual({
      param: 'key',
      value: 'id|91052133-1e18-4af8-b54e-499ab279f446',
    });
  });

  it('sends a number to the id parameter', () => {
    expect(parseServerRef(' 89 ')).toEqual({ param: 'id', value: '89' });
  });

  it.each(['', 'foo', '12a', '-5', 'id|89', '91052133-1e18-4af8-b54e'])('rejects %j', (input) => {
    expect(parseServerRef(input)).toBeNull();
  });
});
