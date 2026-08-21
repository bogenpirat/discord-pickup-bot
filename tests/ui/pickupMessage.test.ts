import { describe, expect, it } from 'vitest';
import type { PickupRecord } from '../../src/db/repositories/pickupRepository.ts';
import { decodeCustomId } from '../../src/discord/customId.ts';
import type { ResponseSet } from '../../src/domain/pickupState.ts';
import { renderNames, renderPickupMessage } from '../../src/ui/pickupMessage.ts';
import { type AppLocale, stringsFor } from '../../src/ui/strings.ts';

const basePickup: PickupRecord = {
  id: 12,
  guildId: 'guild-1',
  channelId: 'channel-1',
  messageId: 'message-1',
  creatorId: 'creator-1',
  startsAt: null,
  startsAtText: null,
  note: null,
  status: 'open',
  createdAt: 0,
  closedAt: null,
};

const pickup = (overrides: Partial<PickupRecord> = {}): PickupRecord => ({
  ...basePickup,
  ...overrides,
});

const responses = (count: number, choice: 'in' | 'later' | 'out' = 'in'): ResponseSet =>
  Array.from({ length: count }, (_, index) => ({
    userId: `user-${index}`,
    choice,
    respondedAt: index,
  }));

const render = (overrides: Parameters<typeof renderPickupMessage>[0]) =>
  renderPickupMessage(overrides);

describe('button rendering', () => {
  it('puts live counts in the labels', () => {
    const payload = render({
      pickup: pickup(),
      responses: [...responses(4, 'in'), ...responses(2, 'out')].map((response, index) => ({
        ...response,
        userId: `u${index}`,
      })),
      mentionRoleId: null,
    });

    const labels = payload.components[0]
      ?.toJSON()
      .components.map((component) => ('label' in component ? component.label : undefined));

    expect(labels).toEqual(['Dabei · 4', 'Später · 0', 'Raus · 2', 'Schließen']);
  });

  it('puts all four buttons in a single action row', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });

    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]?.toJSON().components).toHaveLength(4);
  });

  it('encodes a decodable custom id on every button', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });
    const ids = payload.components
      .flatMap((row) => row.toJSON().components)
      .map((component) => ('custom_id' in component ? component.custom_id : ''));

    expect(ids).toHaveLength(4);
    for (const id of ids) {
      const decoded = decodeCustomId(id ?? '');
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.value.pickupId).toBe(12);
      }
    }
  });

  it('disables every button when closed', () => {
    const payload = render({
      pickup: pickup({ status: 'closed', closedAt: 5 }),
      responses: [],
      mentionRoleId: 'role-1',
    });

    const disabled = payload.components
      .flatMap((row) => row.toJSON().components)
      .map((component) => ('disabled' in component ? component.disabled : undefined));

    expect(disabled).toEqual([true, true, true, true]);
  });
});

describe('role mention', () => {
  it('mentions the configured role and scopes allowed mentions to it', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: 'role-1' });
    expect(payload.content).toBe('<@&role-1>');
    expect(payload.allowedMentions).toEqual({ parse: [], roles: ['role-1'] });
  });

  it('omits the mention when no role is configured', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });
    expect(payload.content).toBe('');
    expect(payload.allowedMentions).toEqual({ parse: [], roles: [] });
  });

  it('drops the mention once the pickup is closed', () => {
    const payload = render({
      pickup: pickup({ status: 'closed' }),
      responses: [],
      mentionRoleId: 'role-1',
    });
    expect(payload.content).toBe('');
    expect(payload.allowedMentions.roles).toEqual([]);
  });
});

describe('start time', () => {
  it('renders a parsed time as discord timestamps', () => {
    const startsAt = Date.UTC(2026, 6, 27, 18, 30);
    const payload = render({ pickup: pickup({ startsAt }), responses: [], mentionRoleId: null });
    const description = payload.embeds[0]?.toJSON().description ?? '';
    const seconds = Math.floor(startsAt / 1000);

    expect(description).toContain(`<t:${seconds}:t>`);
    expect(description).toContain(`<t:${seconds}:R>`);
  });

  it('renders unparsed input verbatim without a timestamp', () => {
    const payload = render({
      pickup: pickup({ startsAtText: 'kurz nach dem Abendessen' }),
      responses: [],
      mentionRoleId: null,
    });
    const description = payload.embeds[0]?.toJSON().description ?? '';

    expect(description).toContain('kurz nach dem Abendessen');
    expect(description).not.toContain('<t:');
  });

  it('omits the start line entirely when no time was given', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });
    const description = payload.embeds[0]?.toJSON().description ?? '';
    expect(description).not.toContain('Start');
  });
});

describe('name lists', () => {
  it('shows a placeholder for an empty group', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });
    const fields = payload.embeds[0]?.toJSON().fields ?? [];
    expect(fields.map((field) => field.value)).toEqual(['—', '—', '—']);
  });

  it('truncates past fifteen names with a remainder hint', () => {
    const text = renderNames(responses(20), stringsFor('de'));
    expect(text.split('\n')).toHaveLength(16);
    expect(text).toContain('… +5 weitere');
  });

  it.each([0, 1, 15, 16, 100])('keeps a %s-name field inside the discord limit', (count) => {
    const text = renderNames(responses(count), stringsFor('de'));
    expect(text.length).toBeLessThanOrEqual(1024);
  });

  it('keeps every field inside the limit with a hundred signups', () => {
    const payload = render({ pickup: pickup(), responses: responses(100), mentionRoleId: null });
    const fields = payload.embeds[0]?.toJSON().fields ?? [];
    for (const field of fields) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
  });

  it('falls back to a pure remainder when even one name would overflow', () => {
    const huge: ResponseSet = [{ userId: 'x'.repeat(2000), choice: 'in', respondedAt: 0 }];
    const text = renderNames(huge, stringsFor('de'));
    expect(text).toBe('… +1 weitere');
  });

  it('counts each group in the field name', () => {
    const payload = render({ pickup: pickup(), responses: responses(3), mentionRoleId: null });
    const fields = payload.embeds[0]?.toJSON().fields ?? [];
    expect(fields[0]?.name).toBe('✅ Dabei (3)');
    expect(fields[2]?.name).toBe('❌ Raus (0)');
  });
});

describe('configurable emojis', () => {
  const fieldNames = (emojis?: Parameters<typeof renderPickupMessage>[0]['emojis']) => {
    const payload = render({
      pickup: pickup(),
      responses: [],
      mentionRoleId: null,
      ...(emojis === undefined ? {} : { emojis }),
    });
    return (payload.embeds[0]?.toJSON().fields ?? []).map((field) => field.name);
  };

  it('uses the defaults when nothing is configured', () => {
    expect(fieldNames()).toEqual(['✅ Dabei (0)', '🕗 Später (0)', '❌ Raus (0)']);
  });

  it('uses the defaults when every choice is null', () => {
    expect(fieldNames({ in: null, later: null, out: null })).toEqual([
      '✅ Dabei (0)',
      '🕗 Später (0)',
      '❌ Raus (0)',
    ]);
  });

  it('replaces only the configured icons', () => {
    expect(fieldNames({ in: '🔥', later: null, out: '💀' })).toEqual([
      '🔥 Dabei (0)',
      '🕗 Später (0)',
      '💀 Raus (0)',
    ]);
  });

  it('renders a custom server emoji verbatim', () => {
    expect(fieldNames({ in: '<:valorant:123456789012345678>', later: null, out: null })[0]).toBe(
      '<:valorant:123456789012345678> Dabei (0)',
    );
  });

  const buttonEmojis = (emojis?: Parameters<typeof renderPickupMessage>[0]['emojis']) => {
    const payload = render({
      pickup: pickup(),
      responses: [],
      mentionRoleId: null,
      ...(emojis === undefined ? {} : { emojis }),
    });
    return (payload.components[0]?.toJSON().components ?? [])
      .slice(0, 3)
      .map((component) => ('emoji' in component ? component.emoji : undefined));
  };

  it('decorates the buttons with the default emoji', () => {
    expect(buttonEmojis()).toEqual([
      { name: '✅', animated: false },
      { name: '🕗', animated: false },
      { name: '❌', animated: false },
    ]);
  });

  it('decorates the buttons with configured emoji', () => {
    expect(buttonEmojis({ in: '🔥', later: null, out: '💀' })).toEqual([
      { name: '🔥', animated: false },
      { name: '🕗', animated: false },
      { name: '💀', animated: false },
    ]);
  });

  it('resolves a custom server emoji on a button', () => {
    expect(
      buttonEmojis({ in: '<:valorant:123456789012345678>', later: null, out: null })[0],
    ).toEqual({ id: '123456789012345678', name: 'valorant', animated: false });
  });

  it('resolves an animated custom emoji on a button', () => {
    expect(buttonEmojis({ in: '<a:spin:123456789012345678>', later: null, out: null })[0]).toEqual({
      id: '123456789012345678',
      name: 'spin',
      animated: true,
    });
  });

  it('keeps the plain text labels alongside the emoji', () => {
    const payload = render({
      pickup: pickup(),
      responses: [],
      mentionRoleId: null,
      emojis: { in: '🔥', later: null, out: null },
    });
    const labels = payload.components[0]
      ?.toJSON()
      .components.slice(0, 3)
      .map((component) => ('label' in component ? component.label : undefined));

    expect(labels).toEqual(['Dabei · 0', 'Später · 0', 'Raus · 0']);
  });

  it.each(['not-an-emoji', '', '<:broken>', ':)'])(
    'falls back to the default when the stored value %s is not an emoji',
    (stored) => {
      const payload = render({
        pickup: pickup(),
        responses: [],
        mentionRoleId: null,
        emojis: { in: stored, later: null, out: null },
      });
      const first = payload.components[0]?.toJSON().components[0];

      expect(first !== undefined && 'emoji' in first ? first.emoji : undefined).toEqual({
        name: '✅',
        animated: false,
      });
      expect(payload.embeds[0]?.toJSON().fields?.[0]?.name).toBe('✅ Dabei (0)');
    },
  );

  it('leaves the close button undecorated at the end of the row', () => {
    const payload = render({
      pickup: pickup(),
      responses: [],
      mentionRoleId: null,
      emojis: { in: '🔥', later: '💀', out: '⛔' },
    });
    const row = payload.components[0]?.toJSON().components ?? [];
    const close = row[3];

    expect(row).toHaveLength(4);
    expect(close).toBeDefined();
    expect(close !== undefined && 'label' in close ? close.label : '').toBe('Schließen');
    expect(close !== undefined && 'emoji' in close ? close.emoji : undefined).toBeUndefined();
  });
});

describe('locale', () => {
  it.each<[AppLocale, string]>([
    ['de', 'Dabei · 0'],
    ['en', 'In · 0'],
  ])('renders %s labels', (locale, expected) => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null, locale });
    const first = payload.components[0]?.toJSON().components[0];
    expect(first !== undefined && 'label' in first ? first.label : '').toBe(expected);
  });

  it('defaults to german', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });
    const first = payload.components[0]?.toJSON().components[0];
    expect(first !== undefined && 'label' in first ? first.label : '').toBe('Dabei · 0');
  });
});

describe('note', () => {
  it('appends the note to the title', () => {
    const payload = render({
      pickup: pickup({ note: 'ranked only' }),
      responses: [],
      mentionRoleId: null,
    });
    expect(payload.embeds[0]?.toJSON().title).toBe('Pickup — ranked only');
  });

  it('uses the bare title without a note', () => {
    const payload = render({ pickup: pickup(), responses: [], mentionRoleId: null });
    expect(payload.embeds[0]?.toJSON().title).toBe('Pickup');
  });
});

describe('calendar buttons', () => {
  const startsAt = Date.UTC(2026, 7, 22, 19, 0);
  const BASE_URL = 'http://pickup.example.net:18080';

  interface ViewOptions {
    readonly guildName?: string | null;
    readonly locale?: AppLocale;
    readonly publicBaseUrl?: string | null;
  }

  const view = (overrides: Partial<PickupRecord>, options: ViewOptions = {}) =>
    render({
      pickup: pickup(overrides),
      responses: [],
      mentionRoleId: null,
      guildName: options.guildName === undefined ? 'Test Guild' : options.guildName,
      publicBaseUrl: options.publicBaseUrl === undefined ? BASE_URL : options.publicBaseUrl,
      ...(options.locale === undefined ? {} : { locale: options.locale }),
    });

  /** The calendar links live on their own row, below the responses and close. */
  const calendarRow = (overrides: Partial<PickupRecord> = {}, options: ViewOptions = {}) =>
    view(overrides, options).components[1]?.toJSON().components ?? [];

  const buttonLabelled = (
    label: string,
    overrides: Partial<PickupRecord> = {},
    options: ViewOptions = {},
  ) => calendarRow(overrides, options).find((c) => 'label' in c && c.label === label);

  const urlOf = (button: ReturnType<typeof buttonLabelled>) =>
    button !== undefined && 'url' in button ? (button.url ?? '') : '';

  const googleUrl = (overrides: Partial<PickupRecord> = {}, options: ViewOptions = {}) =>
    urlOf(buttonLabelled('GCal', overrides, options));

  const icalUrl = (overrides: Partial<PickupRecord> = {}, options: ViewOptions = {}) =>
    urlOf(buttonLabelled('iCal', overrides, options));

  describe('layout', () => {
    it('keeps the responses and close together on the first row', () => {
      const labels = view({ startsAt })
        .components[0]?.toJSON()
        .components.map((component) => ('label' in component ? component.label : undefined));

      expect(labels).toEqual(['Dabei · 0', 'Später · 0', 'Raus · 0', 'Schließen']);
    });

    it('puts both calendar links on a second row', () => {
      expect(calendarRow({ startsAt }).map((c) => ('label' in c ? c.label : undefined))).toEqual([
        'GCal',
        'iCal',
      ]);
    });

    // Discord allows five buttons per row, so the split is not cosmetic.
    it('never puts more than five buttons in a row', () => {
      for (const row of view({ startsAt }).components) {
        expect(row.toJSON().components.length).toBeLessThanOrEqual(5);
      }
    });

    it('drops the second row entirely when no discrete time was recognised', () => {
      expect(view({}).components).toHaveLength(1);
    });

    it('drops the second row when the time was only understood as text', () => {
      expect(view({ startsAtText: 'kurz nach dem Abendessen' }).components).toHaveLength(1);
    });

    it('carries no custom id on either link button', () => {
      for (const component of calendarRow({ startsAt })) {
        expect('custom_id' in component ? component.custom_id : undefined).toBeUndefined();
      }
    });

    it('stays clickable on a closed pickup', () => {
      const row = calendarRow({ startsAt, status: 'closed', closedAt: 5 });

      expect(row).toHaveLength(2);
      for (const component of row) {
        expect('disabled' in component ? component.disabled : undefined).not.toBe(true);
      }
    });
  });

  describe('google calendar link', () => {
    it('carries the calendar emoji and a GCal label', () => {
      const button = buttonLabelled('GCal', { startsAt });
      expect(button !== undefined && 'emoji' in button ? button.emoji : undefined).toEqual({
        name: '📅',
        animated: false,
      });
    });

    it('spans the start time and two hours', () => {
      expect(googleUrl({ startsAt })).toContain('dates=20260822T190000Z/20260822T210000Z');
    });

    it('names the guild in the event title', () => {
      expect(
        new URL(googleUrl({ startsAt }, { guildName: 'Bogenpirat' })).searchParams.get('text'),
      ).toBe('Gaming-Session @ Bogenpirat');
    });

    it('leaves the note out of the event title', () => {
      expect(
        new URL(googleUrl({ startsAt, note: 'Helldivers 20:30' })).searchParams.get('text'),
      ).toBe('Gaming-Session @ Test Guild');
    });

    it('falls back to a bare title when the guild is not in cache', () => {
      expect(new URL(googleUrl({ startsAt }, { guildName: null })).searchParams.get('text')).toBe(
        'Gaming-Session',
      );
    });

    it('links back to the pickup message in the details', () => {
      expect(new URL(googleUrl({ startsAt })).searchParams.get('details')).toBe(
        'Organisiert über Discord: https://discord.com/channels/guild-1/channel-1/message-1',
      );
    });

    it('omits the details while the message id is still unknown', () => {
      expect(googleUrl({ startsAt, messageId: null })).not.toContain('details=');
    });

    it('translates the event text', () => {
      const url = new URL(googleUrl({ startsAt }, { guildName: 'Bogenpirat', locale: 'en' }));
      expect(url.searchParams.get('text')).toBe('Gaming session @ Bogenpirat');
      expect(url.searchParams.get('details')).toBe(
        'Organised via Discord: https://discord.com/channels/guild-1/channel-1/message-1',
      );
    });

    // Discord caps a guild name at 100 characters, which still percent-encodes
    // past the 512 a link button allows.
    it.each([
      ['a plain name', 'Bogenpirat'],
      ['a maximum length name', 'x'.repeat(100)],
      ['a name of emoji', '🎮'.repeat(50)],
      ['a name of umlauts', 'ä'.repeat(100)],
    ])('keeps the url inside the button limit with %s', (_label, guildName) => {
      const url = googleUrl({ startsAt, note: 'x'.repeat(200) }, { guildName });
      expect(url).not.toBe('');
      expect(url.length).toBeLessThanOrEqual(512);
      expect(() => new URL(url)).not.toThrow();
    });

    it('shortens a long guild name without splitting a surrogate pair', () => {
      const text = new URL(
        googleUrl({ startsAt }, { guildName: '🎮'.repeat(50) }),
      ).searchParams.get('text');
      expect(text).toMatch(/^Gaming-Session @ 🎮+$/u);
    });
  });

  describe('ical link', () => {
    it('carries its own emoji and an iCal label', () => {
      const button = buttonLabelled('iCal', { startsAt });
      expect(button !== undefined && 'emoji' in button ? button.emoji : undefined).toEqual({
        name: '📆',
        animated: false,
      });
    });

    it('points at this bot under the configured base url', () => {
      expect(icalUrl({ startsAt })).toBe(`${BASE_URL}/pickup/calendar/12.ics?lang=de`);
    });

    it('carries the rendered locale so both buttons agree on the language', () => {
      expect(icalUrl({ startsAt }, { locale: 'en' })).toBe(
        `${BASE_URL}/pickup/calendar/12.ics?lang=en`,
      );
    });

    // Unlike the Google link, nothing about the event is baked into the URL —
    // the server reads the pickup afresh on every request.
    it('does not change when the event details do', () => {
      expect(icalUrl({ startsAt, note: 'ranked', messageId: null })).toBe(
        icalUrl({ startsAt, note: 'casual' }),
      );
    });

    it('stays absent when no http server is configured, leaving GCal alone', () => {
      const row = calendarRow({ startsAt }, { publicBaseUrl: null });

      expect(row).toHaveLength(1);
      expect(row.map((c) => ('label' in c ? c.label : undefined))).toEqual(['GCal']);
    });

    it('appears before the message id is known, unlike the google link', () => {
      expect(icalUrl({ startsAt, messageId: null })).not.toBe('');
    });
  });
});
