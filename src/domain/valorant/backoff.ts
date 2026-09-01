const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const JITTER = 0.2;

/**
 * Worth another attempt: 429 means we were early, 5xx means the API stumbled.
 * Every other 4xx is about the request itself and would fail again identically.
 */
export const isRetryable = (status: number): boolean => status === 429 || status >= 500;

/** Seconds from a `Retry-After` or `X-RateLimit-Reset` header, or null if unusable. */
export const parseDelaySeconds = (header: string | null): number | null => {
  if (header === null) {
    return null;
  }
  // `Number('')` is 0, which would read as "retry immediately" rather than as the
  // absent header a blank value actually is.
  const trimmed = header.trim();
  if (trimmed === '') {
    return null;
  }
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
};

export interface RetryDelayInput {
  /** Zero-based: 0 is the delay before the first retry. */
  readonly attempt: number;
  readonly retryAfterSeconds: number | null;
  readonly resetSeconds: number | null;
  /** Injected so the jitter is assertable. */
  readonly random?: () => number;
}

/**
 * The server knows when it will forgive us, so `Retry-After` wins over the reset
 * window, which in turn wins over blind exponential growth. Jitter keeps several
 * requests that were rejected together from returning together.
 */
export const retryDelayMs = (input: RetryDelayInput): number => {
  const random = input.random ?? Math.random;
  const fromServer = input.retryAfterSeconds ?? input.resetSeconds;
  const base =
    fromServer === null ? BASE_DELAY_MS * 2 ** input.attempt : Math.ceil(fromServer * 1_000);
  const jittered = base * (1 + (random() * 2 - 1) * JITTER);

  return Math.min(MAX_DELAY_MS, Math.max(0, Math.round(jittered)));
};
