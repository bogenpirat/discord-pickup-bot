import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../logger.ts';
import type { AuditSink } from './trail.ts';

/**
 * Appends entries to a file, one line each.
 *
 * Synchronous on purpose: `O_APPEND` makes each entry a single write syscall, so
 * lines never interleave and nothing sits in a buffer waiting to be lost when the
 * container is killed. The volume is one write per interaction.
 *
 * Every failure is swallowed after a warning. An unwritable mount — the usual
 * cause being a bind-mounted directory the container's user does not own — must
 * cost the audit trail, never the command the member is waiting on.
 */
export const createAuditFileSink = (path: string, logger: Logger): AuditSink => {
  let broken = false;

  const warnOnce = (error: unknown): void => {
    if (broken) {
      return;
    }
    broken = true;
    logger.warn(
      { err: error, path, hint: 'the directory must be writable by the container user (uid 1000)' },
      'audit log not writable, dropping entries',
    );
  };

  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    warnOnce(error);
  }

  return (line) => {
    try {
      appendFileSync(path, `${line}\n`);
      // Cleared only on success, so a mount that comes back and breaks again is
      // reported a second time rather than staying silent forever.
      broken = false;
    } catch (error) {
      warnOnce(error);
    }
  };
};
