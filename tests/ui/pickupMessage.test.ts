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

const responses = (count: number, choice: 'in' | 'ifMore' | 'out' = 'in'): ResponseSet =>
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

    expect(labels).toEqual(['Dabei · 4', 'Wenn mehr · 0', 'Raus · 2']);
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
