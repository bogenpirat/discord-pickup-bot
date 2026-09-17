import { createKeyedMutex } from './mutex.ts';

const DEFAULT_WINDOW_MS = 60_000;

/** Admission slot in the current window, plus whatever a 429 told us to sit out. */
export interface RateLimiterState {
  /** Requests admitted inside the trailing window. */
  readonly used: number;
  readonly limit: number;
  /** Callers currently queued behind a full window or a penalty. */
  readonly waiting: number;
  /** Epoch ms until which a 429 penalty blocks admission, or null. */
  readonly blockedUntil: number | null;
}

export interface RateLimiter {
  /** Resolves once the caller may send. Callers are admitted in arrival order. */
  acquire(): Promise<void>;
  /**
   * Hold every caller back until `epochMs`. Called after a 429 so the requests
   * already queued sit out the server's reset instead of each rediscovering the
   * 429 for themselves.
   */
  penalizeUntil(epochMs: number): void;
  state(): RateLimiterState;
}

export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A sliding-window limiter rather than a token bucket: HenrikDev counts requests
 * over a trailing minute, so a bucket that has refilled to full would let a burst
 * of `limit` land on top of a burst that is still inside the window.
 */
export const createRateLimiter = (options: RateLimiterOptions): RateLimiter => {
  const { limit } = options;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  // Only admission is serialized, not the requests themselves: callers leave this
  // mutex as soon as they hold a slot and then run concurrently.
  const gate = createKeyedMutex();
  const admitted: number[] = [];
  let blockedUntil: number | null = null;
  let waiting = 0;

  const prune = (): void => {
    const cutoff = now() - windowMs;
    while (admitted.length > 0 && (admitted[0] ?? 0) <= cutoff) {
      admitted.shift();
    }
  };

  const admit = async (): Promise<void> => {
    for (;;) {
      prune();

      if (blockedUntil !== null) {
        const penalty = blockedUntil - now();
        if (penalty > 0) {
          await sleep(penalty);
          continue;
        }
        blockedUntil = null;
      }

      if (admitted.length < limit) {
        admitted.push(now());
        return;
      }

      // The window frees a slot exactly one window after its oldest entry. The
      // extra millisecond keeps that entry outside the cutoff on the next pass.
      const oldest = admitted[0] ?? now();
      await sleep(Math.max(1, oldest + windowMs - now() + 1));
    }
  };

  return {
    acquire: async () => {
      waiting += 1;
      try {
        await gate.runExclusive('rate-limit', admit);
      } finally {
        waiting -= 1;
      }
    },

    penalizeUntil: (epochMs) => {
      if (blockedUntil === null || epochMs > blockedUntil) {
        blockedUntil = epochMs;
      }
    },

    state: () => {
      prune();
      return { used: admitted.length, limit, waiting, blockedUntil };
    },
  };
};
