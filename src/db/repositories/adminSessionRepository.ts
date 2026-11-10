import type { DatabaseSync } from 'node:sqlite';
import { asNumber, asText, type SqlRow } from '../rows.ts';

export interface AdminSession {
  readonly tokenHash: string;
  /** Sent back with every form, so a request from another site cannot act for the session. */
  readonly csrfToken: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface AdminSessionRepository {
  create(session: AdminSession): void;
  /** The session behind a token hash, or undefined once it is gone or has expired. */
  find(tokenHash: string, now: number): AdminSession | undefined;
  remove(tokenHash: string): void;
  /** Drops every expired session. Returns how many went. */
  pruneExpired(now: number): number;
}

const toSession = (row: SqlRow): AdminSession => ({
  tokenHash: asText(row['token_hash']),
  csrfToken: asText(row['csrf_token']),
  createdAt: asNumber(row['created_at']),
  expiresAt: asNumber(row['expires_at']),
});

export const createAdminSessionRepository = (db: DatabaseSync): AdminSessionRepository => {
  const insertStatement = db.prepare(
    'INSERT INTO admin_sessions (token_hash, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?)',
  );
  const findStatement = db.prepare(
    'SELECT * FROM admin_sessions WHERE token_hash = ? AND expires_at > ?',
  );
  const deleteStatement = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');
  const pruneStatement = db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?');

  return {
    create: (session) => {
      insertStatement.run(
        session.tokenHash,
        session.csrfToken,
        session.createdAt,
        session.expiresAt,
      );
    },
    find: (tokenHash, now) => {
      const row = findStatement.get(tokenHash, now);
      return row === undefined ? undefined : toSession(row as SqlRow);
    },
    remove: (tokenHash) => {
      deleteStatement.run(tokenHash);
    },
    pruneExpired: (now) => Number(pruneStatement.run(now).changes),
  };
};
