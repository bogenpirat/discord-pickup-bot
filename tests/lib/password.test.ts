import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRYPT_PARAMS,
  hashPassword,
  isPasswordHash,
  type ScryptParams,
  verifyPassword,
} from '../../src/lib/password.ts';

/** Cheap enough to run many times; the format and checks are the same at any cost. */
const FAST: ScryptParams = { cost: 2 ** 10, blockSize: 8, parallelization: 1 };

describe('hashPassword', () => {
  it('produces a hash that checks out against the same password only', async () => {
    const hash = await hashPassword('correct horse battery', FAST);

    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterz', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts every hash differently', async () => {
    const first = await hashPassword('same password', FAST);
    const second = await hashPassword('same password', FAST);

    expect(first).not.toBe(second);
  });

  it('keeps clear of the dollar sign Docker Compose would interpolate', async () => {
    const hash = await hashPassword('x'.repeat(40), FAST);

    expect(hash).toMatch(/^scrypt:1024:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(hash).not.toContain('$');
  });

  it('defaults to the OWASP baseline cost', async () => {
    const hash = await hashPassword('baseline password');

    expect(hash.startsWith(`scrypt:${DEFAULT_SCRYPT_PARAMS.cost}:8:1:`)).toBe(true);
    expect(await verifyPassword('baseline password', hash)).toBe(true);
  });

  it('treats differently composed unicode as the same password', async () => {
    const hash = await hashPassword('Mädchen', FAST);

    expect(await verifyPassword('Mädchen', hash)).toBe(true);
  });
});

describe('isPasswordHash', () => {
  it('accepts what hashPassword makes', async () => {
    expect(isPasswordHash(await hashPassword('anything at all', FAST))).toBe(true);
  });

  it.each([
    ['a plain password', 'hunter2hunter2'],
    ['an empty string', ''],
    ['a bcrypt hash', '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234'],
    ['a cost that is not a power of two', 'scrypt:1000:8:1:c2FsdA:aGFzaA'],
    ['a block size of zero', 'scrypt:1024:0:1:c2FsdA:aGFzaA'],
    ['a parallelization of zero', 'scrypt:1024:8:0:c2FsdA:aGFzaA'],
    ['a missing hash', 'scrypt:1024:8:1:c2FsdA:'],
    ['a cost above the ceiling', 'scrypt:2097152:8:1:c2FsdA:aGFzaA'],
    ['a block size above the ceiling', 'scrypt:1024:17:1:c2FsdA:aGFzaA'],
    ['a parallelization above the ceiling', 'scrypt:1024:8:5:c2FsdA:aGFzaA'],
    [
      'a cost that only looks like a power of two in 32 bits',
      'scrypt:4294967297:8:1:c2FsdA:aGFzaA',
    ],
  ])('rejects %s', (_label, value) => {
    expect(isPasswordHash(value)).toBe(false);
  });
});

describe('verifyPassword', () => {
  it('never matches a malformed hash', async () => {
    expect(await verifyPassword('hunter2hunter2', 'hunter2hunter2')).toBe(false);
  });
});
