import { describe, expect, it } from 'vitest';
import { decodeCustomId, encodeClose, encodeRespond } from '../../src/discord/customId.ts';
import { PICKUP_CHOICES } from '../../src/domain/pickupChoice.ts';

describe('round trip', () => {
  it.each([...PICKUP_CHOICES])('encodes and decodes respond:%s', (choice) => {
    const decoded = decodeCustomId(encodeRespond(choice, 42));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value).toEqual({ action: 'respond', choice, pickupId: 42 });
    }
  });

  it('encodes and decodes close', () => {
    const decoded = decodeCustomId(encodeClose(7));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value).toEqual({ action: 'close', pickupId: 7 });
    }
  });

  it('stays inside the discord custom id length limit', () => {
    expect(encodeRespond('ifMore', Number.MAX_SAFE_INTEGER).length).toBeLessThanOrEqual(100);
  });
});

describe('rejections', () => {
  it.each([
    ['other:respond:in:1', 'foreignNamespace'],
    ['', 'foreignNamespace'],
    ['pickup:explode:1', 'unknownAction'],
    ['pickup', 'unknownAction'],
    ['pickup:respond:in', 'malformed'],
    ['pickup:respond:in:1:2', 'malformed'],
    ['pickup:respond:maybe:1', 'malformed'],
    ['pickup:respond:in:abc', 'malformed'],
    ['pickup:respond:in:-1', 'malformed'],
    ['pickup:respond:in:', 'malformed'],
    ['pickup:close', 'malformed'],
    ['pickup:close:abc', 'malformed'],
    ['pickup:close:1:2', 'malformed'],
  ])('rejects %s as %s', (customId, error) => {
    const decoded = decodeCustomId(customId);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.error).toBe(error);
    }
  });
});
