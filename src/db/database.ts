import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.ts';

export const openDatabase = (location: string): DatabaseSync => {
  const db = new DatabaseSync(location);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);

  return db;
};

export const withTransaction = <T>(db: DatabaseSync, run: () => T): T => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
