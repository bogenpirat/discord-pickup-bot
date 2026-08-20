import { describe, expect, it } from 'vitest';
import { googleCalendarLink } from '../../../src/domain/calendar/googleCalendarLink.ts';

const startsAt = Date.UTC(2026, 7, 22, 19, 0, 0);

describe('googleCalendarLink', () => {
  it('matches the template google documents', () => {
    const url = googleCalendarLink({
      title: 'Gaming session: Helldivers',
      startsAt,
      durationMinutes: 120,
      details: 'Organised via #gaming-nights',
    });

    expect(url).toBe(
      'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=Gaming+session%3A+Helldivers' +
        '&dates=20260822T190000Z/20260822T210000Z' +
        '&details=Organised+via+%23gaming-nights',
    );
  });

  it('derives the end from the duration', () => {
    const url = googleCalendarLink({ title: 'x', startsAt, durationMinutes: 30 });
    expect(url).toContain('dates=20260822T190000Z/20260822T193000Z');
  });

  it('omits details when there are none', () => {
    const url = googleCalendarLink({ title: 'x', startsAt, durationMinutes: 120 });
    expect(url).not.toContain('details=');
  });

  it('converts a local start time to utc', () => {
    const berlinEvening = Temporal.ZonedDateTime.from('2026-08-22T21:00[Europe/Berlin]');
    const url = googleCalendarLink({
      title: 'x',
      startsAt: berlinEvening.epochMilliseconds,
      durationMinutes: 120,
    });

    expect(url).toContain('dates=20260822T190000Z/20260822T210000Z');
  });

  it('rolls the end date over midnight', () => {
    const url = googleCalendarLink({
      title: 'x',
      startsAt: Date.UTC(2026, 7, 22, 23, 30),
      durationMinutes: 120,
    });
    expect(url).toContain('dates=20260822T233000Z/20260823T013000Z');
  });

  it('escapes characters that would otherwise break the query', () => {
    const url = googleCalendarLink({
      title: 'ranked & unrated =?#',
      startsAt,
      durationMinutes: 120,
    });

    expect(url).toContain('text=ranked+%26+unrated+%3D%3F%23');
  });

  it('survives emoji and umlauts in the title', () => {
    const url = googleCalendarLink({ title: '🎮 Später', startsAt, durationMinutes: 120 });
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).searchParams.get('text')).toBe('🎮 Später');
  });

  it('round-trips through a url parser', () => {
    const url = new URL(
      googleCalendarLink({
        title: 'Gaming session: Helldivers',
        startsAt,
        durationMinutes: 120,
        details: 'Organised via Discord: https://discord.com/channels/1/2/3',
      }),
    );

    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Gaming session: Helldivers');
    expect(url.searchParams.get('dates')).toBe('20260822T190000Z/20260822T210000Z');
    expect(url.searchParams.get('details')).toBe(
      'Organised via Discord: https://discord.com/channels/1/2/3',
    );
  });
});
