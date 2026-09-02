import { describe, expect, it } from 'vitest';
import { createAuditTrail, createDisabledAuditTrail } from '../../src/audit/trail.ts';
import type { AuditApiCall, AuditEntry, AuditSubject } from '../../src/audit/types.ts';

const command = (name: string): AuditSubject => ({
  kind: 'command',
  command: name,
  guildId: 'guild-1',
  channelId: 'channel-1',
  userId: 'user-1',
  user: 'julian',
  locale: 'de',
  options: {},
});

const apiCall = (path: string): AuditApiCall => ({
  method: 'GET',
  path,
  status: 200,
  attempts: 1,
  durationMs: 5,
});

/** A clock that advances one millisecond per read, so durations are deterministic. */
const tickingClock = (): (() => number) => {
  let value = 0;
  return () => {
    value += 1;
    return value;
  };
};

const harness = (now = tickingClock()) => {
  const lines: string[] = [];
  const trail = createAuditTrail({
    write: (line) => {
      lines.push(line);
    },
    now,
  });
  return {
    trail,
    lines,
    entries: (): AuditEntry[] => lines.map((line) => JSON.parse(line) as AuditEntry),
  };
};

describe('createAuditTrail', () => {
  it('writes one entry per recorded action', async () => {
    const { trail, entries } = harness();

    await trail.record(command('elo'), async () => undefined);

    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ v: 1, kind: 'command', command: 'elo', outcome: 'ok' });
  });

  it('stamps the entry with the moment the action started', async () => {
    const { trail, entries } = harness(() => Date.UTC(2026, 8, 2, 18, 41, 7, 223));

    await trail.record(command('elo'), async () => undefined);

    expect(entries()[0]?.ts).toBe('2026-09-02T18:41:07.223Z');
  });

  it('measures how long the action took', async () => {
    const { trail, entries } = harness();

    await trail.record(command('elo'), async () => undefined);

    expect(entries()[0]?.durationMs).toBe(1);
  });

  it('collects the api calls the action made', async () => {
    const { trail, entries } = harness();

    await trail.record(command('elo'), async () => {
      trail.addApiCall(apiCall('/account'));
      await Promise.resolve();
      trail.addApiCall(apiCall('/mmr'));
    });

    expect(entries()[0]?.apiCalls.map((call) => call.path)).toEqual(['/account', '/mmr']);
  });

  it('keeps overlapping actions in separate entries', async () => {
    const { trail, entries } = harness();

    const first = trail.record(command('elo'), async () => {
      trail.addApiCall(apiCall('/elo-first'));
      await Promise.resolve();
      trail.addApiCall(apiCall('/elo-second'));
    });
    const second = trail.record(command('last'), async () => {
      trail.addApiCall(apiCall('/last-only'));
    });

    await Promise.all([first, second]);

    const byCommand = new Map(
      entries().flatMap((entry) =>
        entry.kind === 'command' ? [[entry.command, entry.apiCalls] as const] : [],
      ),
    );
    expect(byCommand.get('elo')?.map((call) => call.path)).toEqual(['/elo-first', '/elo-second']);
    expect(byCommand.get('last')?.map((call) => call.path)).toEqual(['/last-only']);
  });

  it('records a throwing action as an error and rethrows it', async () => {
    const { trail, entries } = harness();

    await expect(
      trail.record(command('elo'), async () => {
        trail.addApiCall(apiCall('/account'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(entries()[0]).toMatchObject({ outcome: 'error', error: 'boom' });
    // What it managed to do before failing is still on the record.
    expect(entries()[0]?.apiCalls).toHaveLength(1);
  });

  it('describes a thrown non-error', async () => {
    const { trail, entries } = harness();

    await expect(trail.record(command('elo'), () => Promise.reject('nope'))).rejects.toBe('nope');

    expect(entries()[0]?.error).toBe('nope');
  });

  it('returns what the action returned', async () => {
    const { trail } = harness();

    await expect(trail.record(command('elo'), async () => 'value')).resolves.toBe('value');
  });

  it('drops api calls made outside any action', () => {
    const { trail, lines } = harness();

    expect(() => {
      trail.addApiCall(apiCall('/content'));
    }).not.toThrow();
    expect(lines).toEqual([]);
  });

  it('writes each entry as one line of json', async () => {
    const { trail, lines } = harness();

    await trail.record(command('elo'), async () => {
      trail.addApiCall(apiCall('/account'));
    });

    expect(lines[0]).not.toContain('\n');
    expect(() => JSON.parse(lines[0] ?? '')).not.toThrow();
  });

  it('omits the error field when the action succeeded', async () => {
    const { trail, lines } = harness();

    await trail.record(command('elo'), async () => undefined);

    expect(lines[0]).not.toContain('"error"');
  });

  it('keeps button subjects intact', async () => {
    const { trail, entries } = harness();

    await trail.record(
      {
        kind: 'button',
        action: 'respond',
        pickupId: 7,
        choice: 'in',
        guildId: 'guild-1',
        channelId: 'channel-1',
        userId: 'user-1',
        user: 'julian',
        locale: 'de',
      },
      async () => undefined,
    );

    expect(entries()[0]).toMatchObject({
      kind: 'button',
      action: 'respond',
      pickupId: 7,
      choice: 'in',
    });
  });

  it('defaults to the wall clock', async () => {
    const lines: string[] = [];
    const trail = createAuditTrail({
      write: (line) => {
        lines.push(line);
      },
    });

    await trail.record(command('elo'), async () => undefined);

    const entry = JSON.parse(lines[0] ?? '') as AuditEntry;
    expect(Date.parse(entry.ts)).toBeGreaterThan(Date.UTC(2026, 0, 1));
  });
});

describe('createDisabledAuditTrail', () => {
  it('runs the action and writes nothing', async () => {
    const trail = createDisabledAuditTrail();

    await expect(trail.record(command('elo'), async () => 'value')).resolves.toBe('value');
    expect(() => {
      trail.addApiCall(apiCall('/account'));
    }).not.toThrow();
  });

  it('lets a failure through untouched', async () => {
    const trail = createDisabledAuditTrail();

    await expect(
      trail.record(command('elo'), () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });
});
