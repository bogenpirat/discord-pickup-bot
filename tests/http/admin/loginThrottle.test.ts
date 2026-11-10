import { describe, expect, it } from 'vitest';
import { clientAddress, createLoginThrottle } from '../../../src/http/admin/loginThrottle.ts';

const throttle = () => {
  let now = 0;
  const instance = createLoginThrottle({ maxFailures: 3, windowMs: 1000, now: () => now });
  return {
    instance,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('createLoginThrottle', () => {
  it('blocks a client once it has used up its attempts', () => {
    const { instance } = throttle();

    instance.recordFailure('a');
    instance.recordFailure('a');
    expect(instance.isBlocked('a')).toBe(false);

    instance.recordFailure('a');
    expect(instance.isBlocked('a')).toBe(true);
  });

  it('counts each client on its own', () => {
    const { instance } = throttle();
    for (const _ of [1, 2, 3]) {
      instance.recordFailure('a');
    }

    expect(instance.isBlocked('b')).toBe(false);
  });

  it('forgets failures older than the window', () => {
    const { instance, advance } = throttle();
    for (const _ of [1, 2, 3]) {
      instance.recordFailure('a');
    }

    advance(1001);

    expect(instance.isBlocked('a')).toBe(false);
  });

  it('forgives a client that got in', () => {
    const { instance } = throttle();
    for (const _ of [1, 2, 3]) {
      instance.recordFailure('a');
    }

    instance.reset('a');

    expect(instance.isBlocked('a')).toBe(false);
  });
});

describe('clientAddress', () => {
  it('trusts only the hop the proxy appended', () => {
    expect(clientAddress('6.6.6.6, 203.0.113.9', '172.18.0.2')).toBe('203.0.113.9');
  });

  it('falls back to the socket peer without a proxy header', () => {
    expect(clientAddress(undefined, '127.0.0.1')).toBe('127.0.0.1');
    expect(clientAddress(' , ', '127.0.0.1')).toBe('127.0.0.1');
  });

  it('still names someone when nothing is known', () => {
    expect(clientAddress(undefined, null)).toBe('unknown');
  });
});
