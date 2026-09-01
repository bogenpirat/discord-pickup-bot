import { describe, expect, it } from 'vitest';
import { createRateLimiter, type RateLimiter } from '../../src/lib/rateLimiter.ts';

/**
 * A clock the test drives by hand. `sleep` moves it instead of waiting, so a
 * full minute of limiter behaviour runs instantly and deterministically.
 */
const fakeClock = () => {
  let current = 1_000_000;
  const slept: number[] = [];

  return {
    now: () => current,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
      current += ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
};

const limiterWith = (limit: number, clock: ReturnType<typeof fakeClock>): RateLimiter =>
  createRateLimiter({ limit, now: clock.now, sleep: clock.sleep });

describe('createRateLimiter', () => {
  it('admits up to the limit without sleeping', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(3, clock);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(clock.slept).toEqual([]);
    expect(limiter.state()).toMatchObject({ used: 3, limit: 3 });
  });

  it('makes the request past the limit wait for the window to slide', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(2, clock);

    await limiter.acquire();
    clock.advance(10_000);
    await limiter.acquire();
    await limiter.acquire();

    // The oldest admission was 10s ago, so a slot frees 50s from now.
    expect(clock.slept).toEqual([50_001]);
    expect(limiter.state().used).toBe(2);
  });

  it('forgets admissions once they leave the window', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(2, clock);

    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.state().used).toBe(2);

    clock.advance(60_001);
    expect(limiter.state().used).toBe(0);

    await limiter.acquire();
    expect(clock.slept).toEqual([]);
  });

  it('respects a custom window', async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire();
    await limiter.acquire();

    expect(clock.slept).toEqual([1_001]);
  });

  it('holds everyone back until a penalty expires', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(30, clock);

    limiter.penalizeUntil(clock.now() + 5_000);
    expect(limiter.state().blockedUntil).toBe(clock.now() + 5_000);

    await limiter.acquire();

    expect(clock.slept).toEqual([5_000]);
    expect(limiter.state().blockedUntil).toBeNull();
  });

  it('keeps the longer of two penalties', () => {
    const clock = fakeClock();
    const limiter = limiterWith(30, clock);

    limiter.penalizeUntil(clock.now() + 5_000);
    limiter.penalizeUntil(clock.now() + 1_000);

    expect(limiter.state().blockedUntil).toBe(clock.now() + 5_000);
  });

  it('ignores a penalty that has already passed', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(30, clock);

    limiter.penalizeUntil(clock.now() - 1);
    await limiter.acquire();

    expect(clock.slept).toEqual([]);
    expect(limiter.state().blockedUntil).toBeNull();
  });

  it('admits callers in arrival order', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(1, clock);
    const order: number[] = [];

    const queued = [0, 1, 2].map(async (index) => {
      await limiter.acquire();
      order.push(index);
    });

    await Promise.all(queued);

    expect(order).toEqual([0, 1, 2]);
  });

  it('reports how many callers are queued', async () => {
    const clock = fakeClock();
    const limiter = limiterWith(1, clock);

    await limiter.acquire();

    const pending = limiter.acquire();
    expect(limiter.state().waiting).toBe(1);

    await pending;
    expect(limiter.state().waiting).toBe(0);
  });

  it('waits on a real timer when no sleep is injected', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 5 });

    const started = Date.now();
    await limiter.acquire();
    await limiter.acquire();

    expect(Date.now() - started).toBeGreaterThanOrEqual(4);
  });

  it('uses the wall clock when no clock is injected', async () => {
    const limiter = createRateLimiter({ limit: 1 });
    await limiter.acquire();

    expect(limiter.state().used).toBe(1);
  });
});
