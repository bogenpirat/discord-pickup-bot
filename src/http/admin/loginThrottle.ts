export interface LoginThrottleOptions {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly now: () => number;
}

export interface LoginThrottle {
  /** Whether this client has used up its attempts for now. */
  isBlocked(client: string): boolean;
  recordFailure(client: string): void;
  /** Forgets a client's failures, after it finally got in. */
  reset(client: string): void;
}

/**
 * Counts failed logins per client over a sliding window. Kept in memory: a
 * restart forgiving everyone is fine, since the window is minutes long anyway.
 */
export const createLoginThrottle = (options: LoginThrottleOptions): LoginThrottle => {
  const failures = new Map<string, number[]>();

  const recent = (client: string): number[] => {
    const cutoff = options.now() - options.windowMs;
    const kept = (failures.get(client) ?? []).filter((at) => at > cutoff);
    if (kept.length === 0) {
      failures.delete(client);
    } else {
      failures.set(client, kept);
    }
    return kept;
  };

  return {
    isBlocked: (client) => recent(client).length >= options.maxFailures,
    recordFailure: (client) => {
      failures.set(client, [...recent(client), options.now()]);
    },
    reset: (client) => {
      failures.delete(client);
    },
  };
};

/**
 * Who is asking. Behind Traefik the socket peer is always the proxy, which
 * appends the real peer to `X-Forwarded-For` — so the last entry is the one
 * nobody but the proxy could have written. Earlier entries come from the client
 * and are ignored.
 */
export const clientAddress = (
  forwardedFor: string | undefined,
  remoteAddress: string | null,
): string => {
  const hops = (forwardedFor ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop !== '');
  return hops.at(-1) ?? remoteAddress ?? 'unknown';
};
