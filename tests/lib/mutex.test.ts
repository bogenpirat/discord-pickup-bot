import { describe, expect, it } from 'vitest';
import { createKeyedMutex } from '../../src/lib/mutex.ts';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('createKeyedMutex', () => {
  it('serialises interleaved work on the same key', async () => {
    const mutex = createKeyedMutex();
    const events: string[] = [];

    const task = (name: string, ms: number) => async () => {
      events.push(`${name}:start`);
      await delay(ms);
      events.push(`${name}:end`);
    };

    await Promise.all([
      mutex.runExclusive('a', task('first', 20)),
      mutex.runExclusive('a', task('second', 1)),
      mutex.runExclusive('a', task('third', 1)),
    ]);

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
      'third:start',
      'third:end',
    ]);
  });

  it('runs different keys concurrently', async () => {
    const mutex = createKeyedMutex();
    const events: string[] = [];

    await Promise.all([
      mutex.runExclusive('a', async () => {
        events.push('a:start');
        await delay(20);
        events.push('a:end');
      }),
      mutex.runExclusive('b', async () => {
        events.push('b:start');
        await delay(1);
        events.push('b:end');
      }),
    ]);

    expect(events).toEqual(['a:start', 'b:start', 'b:end', 'a:end']);
  });

  it('returns the task result', async () => {
    const mutex = createKeyedMutex();
    await expect(mutex.runExclusive('a', async () => 42)).resolves.toBe(42);
  });

  it('releases the lock after a rejection instead of deadlocking', async () => {
    const mutex = createKeyedMutex();

    await expect(
      mutex.runExclusive('a', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(mutex.runExclusive('a', async () => 'recovered')).resolves.toBe('recovered');
  });

  it('keeps ordering when an earlier task rejects', async () => {
    const mutex = createKeyedMutex();
    const events: string[] = [];

    const failing = mutex
      .runExclusive('a', async () => {
        events.push('failing');
        await delay(10);
        throw new Error('boom');
      })
      .catch(() => undefined);

    const following = mutex.runExclusive('a', async () => {
      events.push('following');
    });

    await Promise.all([failing, following]);
    expect(events).toEqual(['failing', 'following']);
  });
});
