import { describe, expect, it } from 'vitest';
import type { SteamWatchRecord } from '../../src/db/repositories/steamWatchRepository.ts';
import { describeWatch } from '../../src/steam/watchLog.ts';

const record = (overrides: Partial<SteamWatchRecord> = {}): SteamWatchRecord => ({
  id: 7,
  guildId: 'guild-1',
  channelId: 'channel-1',
  messageId: 'message-1',
  appId: 1245620,
  gameName: 'ELDEN RING',
  status: 'pending',
  releaseDate: null,
  releaseDateText: 'Q2 2026',
  nextCheckAt: Temporal.Instant.from('2026-08-11T12:00:00Z').epochMilliseconds,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('describeWatch', () => {
  it('renders a pending watch with readable timestamps', () => {
    expect(describeWatch(record())).toEqual({
      watchId: 7,
      guildId: 'guild-1',
      appId: 1245620,
      game: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: 'Q2 2026',
      nextCheckAt: '2026-08-11T12:00:00Z',
    });
  });

  it('renders a scheduled release date as a full instant', () => {
    const fields = describeWatch(
      record({
        status: 'scheduled',
        // The exact release moment matters, not just the day: logging only the
        // day hid that the watcher was firing hours early.
        releaseDate: Temporal.Instant.from('2026-09-18T19:43:00Z').epochMilliseconds,
        releaseDateText: '18 Sep, 2026',
      }),
    );

    expect(fields.status).toBe('scheduled');
    expect(fields.releaseDate).toBe('2026-09-18T19:43:00Z');
    expect(fields.releaseDateText).toBe('18 Sep, 2026');
  });
});
