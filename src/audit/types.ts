import type { PickupChoice } from '../domain/pickupChoice.ts';

/** One logical request to the Valorant API, retries folded in. */
export interface AuditApiCall {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean>> | undefined;
  /** Status of the last attempt, or 0 when no response ever arrived. */
  readonly status: number;
  /** Wire attempts including retries; 1 when the first one stuck. */
  readonly attempts: number;
  /** Total time, so it includes rate-limiter queueing and retry backoff. */
  readonly durationMs: number;
  /** The `ValorantError` kind, absent when the call succeeded. */
  readonly error?: string | undefined;
}

/** Who triggered the interaction, and where. */
export interface AuditActor {
  readonly guildId: string | null;
  readonly channelId: string | null;
  readonly userId: string;
  readonly user: string | null;
  readonly locale: string;
}

/** Everything about an interaction that is known before it runs. */
export type AuditSubject = AuditActor &
  (
    | {
        readonly kind: 'command';
        readonly command: string;
        readonly subcommand?: string | undefined;
        readonly options: Readonly<Record<string, string | number | boolean>>;
      }
    | {
        readonly kind: 'button';
        readonly action: 'respond' | 'close';
        readonly pickupId: number;
        readonly choice?: PickupChoice | undefined;
      }
  );

export type AuditOutcome = 'ok' | 'error';

/** One line of the audit log. */
export type AuditEntry = AuditSubject & {
  /** When the interaction started, not when the line was written. */
  readonly ts: string;
  /** Schema version, so a reader can tell old lines from new ones. */
  readonly v: 1;
  readonly outcome: AuditOutcome;
  /** The thrown message, absent unless `outcome` is `error`. */
  readonly error?: string | undefined;
  readonly durationMs: number;
  readonly apiCalls: readonly AuditApiCall[];
};
