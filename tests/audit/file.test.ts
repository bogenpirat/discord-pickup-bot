import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuditFileSink } from '../../src/audit/file.ts';
import { recordingLogger } from '../helpers/fakes.ts';

describe('createAuditFileSink', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const lines = (path: string): string[] => readFileSync(path, 'utf8').split('\n').slice(0, -1);

  it('appends one line per entry', () => {
    const path = join(dir, 'audit.log');
    const write = createAuditFileSink(path, recordingLogger().logger);

    write('{"a":1}');
    write('{"b":2}');

    expect(lines(path)).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('creates the directory the log lives in', () => {
    const path = join(dir, 'nested', 'deeper', 'audit.log');
    const write = createAuditFileSink(path, recordingLogger().logger);

    write('{"a":1}');

    expect(lines(path)).toEqual(['{"a":1}']);
  });

  it('appends to a log that is already there', () => {
    const path = join(dir, 'audit.log');
    writeFileSync(path, '{"old":true}\n');

    createAuditFileSink(path, recordingLogger().logger)('{"new":true}');

    expect(lines(path)).toEqual(['{"old":true}', '{"new":true}']);
  });

  it('warns and carries on when the log cannot be written', () => {
    // A file where the directory has to be: creating and opening both fail.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const logger = recordingLogger();

    const write = createAuditFileSink(join(blocker, 'audit.log'), logger.logger);

    expect(() => {
      write('{"a":1}');
    }).not.toThrow();
    expect(logger.find('audit log not writable, dropping entries')).toBeDefined();
  });

  it('warns once however many entries are dropped', () => {
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const logger = recordingLogger();

    const write = createAuditFileSink(join(blocker, 'audit.log'), logger.logger);
    write('{"a":1}');
    write('{"b":2}');
    write('{"c":3}');

    expect(logger.messages('warn')).toHaveLength(1);
  });
});
