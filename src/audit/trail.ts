import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditApiCall, AuditEntry, AuditOutcome, AuditSubject } from './types.ts';

/** Where a finished entry goes. One call, one line, already serialized. */
export type AuditSink = (line: string) => void;

export interface AuditTrail {
  /** Runs `action` in a fresh scope and writes one entry once it settles. Rethrows. */
  record<T>(subject: AuditSubject, action: () => Promise<T>): Promise<T>;
  /** Appends an API call to the scope in flight; a no-op when there is none. */
  addApiCall(call: AuditApiCall): void;
}

export interface AuditTrailDeps {
  readonly write: AuditSink;
  readonly now?: () => number;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createAuditTrail = (deps: AuditTrailDeps): AuditTrail => {
  const now = deps.now ?? Date.now;

  // The scope has to reach the Valorant client without being threaded through
  // its ~55 endpoint methods and every command that calls them, and it has to
  // survive the awaits in between — including the rate limiter's queue, which
  // can hold a request long after the command that asked for it went to sleep.
  const storage = new AsyncLocalStorage<AuditApiCall[]>();

  const finish = (
    subject: AuditSubject,
    startedAt: number,
    apiCalls: readonly AuditApiCall[],
    outcome: AuditOutcome,
    error?: string,
  ): void => {
    const entry: AuditEntry = {
      ts: Temporal.Instant.fromEpochMilliseconds(startedAt).toString(),
      v: 1,
      ...subject,
      outcome,
      ...(error === undefined ? {} : { error }),
      durationMs: now() - startedAt,
      apiCalls,
    };
    deps.write(JSON.stringify(entry));
  };

  return {
    record: async (subject, action) => {
      const apiCalls: AuditApiCall[] = [];
      const startedAt = now();

      return storage.run(apiCalls, async () => {
        try {
          const value = await action();
          finish(subject, startedAt, apiCalls, 'ok');
          return value;
        } catch (error) {
          // Written before rethrowing, so a command that blew up still leaves a
          // record of what it managed to do first.
          finish(subject, startedAt, apiCalls, 'error', messageOf(error));
          throw error;
        }
      });
    },

    addApiCall: (call) => {
      storage.getStore()?.push(call);
    },
  };
};

/**
 * The shape auditing takes when it is switched off. Handing this out rather than
 * a null keeps every dispatch site free of a branch it would otherwise repeat.
 */
export const createDisabledAuditTrail = (): AuditTrail => ({
  record: (_subject, action) => action(),
  addApiCall: () => undefined,
});
