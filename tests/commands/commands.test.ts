import { describe, expect, it } from 'vitest';
import { pickupConfigCommand } from '../../src/commands/pickupConfig.ts';
import { valoCommand } from '../../src/commands/valo.ts';
import { valoTimeCommand } from '../../src/commands/valoTime.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';

const ADMIN_ROLE = 'role-admin';

describe('/pickup-config access control', () => {
  it('refuses a plain member', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ subcommand: 'show', manageGuild: false });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Server verwalten');
  });

  it('allows a member with manage server', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ subcommand: 'show', manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Kanal:');
  });

  it('allows a power user configured in the environment', async () => {
    const context = createTestContext(undefined, ['power-1']);
    const fake = createFakeCommandInteraction({
      subcommand: 'show',
      manageGuild: false,
      userId: 'power-1',
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Kanal:');
  });

  it('allows a member holding the configured admin role', async () => {
    const context = createTestContext();
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = createFakeCommandInteraction({
      subcommand: 'show',
      manageGuild: false,
      roleIds: [ADMIN_ROLE],
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Kanal:');
  });

  it('refuses a member holding some other role', async () => {
    const context = createTestContext();
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = createFakeCommandInteraction({
      subcommand: 'show',
      manageGuild: false,
      roleIds: ['role-other'],
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Server verwalten');
  });

  it('refuses outside a guild', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ guildId: null, manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });
});

describe('/pickup-config admin-role', () => {
  it('lets an admin set and clear the admin role', async () => {
    const context = createTestContext();

    const set = createFakeCommandInteraction({
      subcommand: 'admin-role',
      manageGuild: true,
      roles: { role: { id: ADMIN_ROLE } },
    });
    await pickupConfigCommand.execute(set.interaction, context);
    expect(context.settings.get('guild-1').configRoleId).toBe(ADMIN_ROLE);

    const clear = createFakeCommandInteraction({ subcommand: 'admin-role', manageGuild: true });
    await pickupConfigCommand.execute(clear.interaction, context);
    expect(context.settings.get('guild-1').configRoleId).toBeNull();
    expect(clear.messages().join(' ')).toContain('keine Admin-Rolle');
  });

  it('lets a power user set the admin role', async () => {
    const context = createTestContext(undefined, ['power-1']);
    const fake = createFakeCommandInteraction({
      subcommand: 'admin-role',
      manageGuild: false,
      userId: 'power-1',
      roles: { role: { id: ADMIN_ROLE } },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').configRoleId).toBe(ADMIN_ROLE);
  });

  it('does not let the admin role grant itself to another role', async () => {
    const context = createTestContext();
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = createFakeCommandInteraction({
      subcommand: 'admin-role',
      manageGuild: false,
      roleIds: [ADMIN_ROLE],
      roles: { role: { id: 'role-escalated' } },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').configRoleId).toBe(ADMIN_ROLE);
    expect(fake.messages().join(' ')).toContain('Nur Mitglieder');
  });
});

describe('/pickup-config settings', () => {
  it('saves the pickup channel', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'channel',
      manageGuild: true,
      channels: { channel: { id: 'channel-9' } },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').pickupChannelId).toBe('channel-9');
    expect(fake.messages().join(' ')).toContain('<#channel-9>');
  });

  it('saves and clears the mention role', async () => {
    const context = createTestContext();

    const set = createFakeCommandInteraction({
      subcommand: 'role',
      manageGuild: true,
      roles: { role: { id: 'role-9' } },
    });
    await pickupConfigCommand.execute(set.interaction, context);
    expect(context.settings.get('guild-1').mentionRoleId).toBe('role-9');

    const clear = createFakeCommandInteraction({ subcommand: 'role', manageGuild: true });
    await pickupConfigCommand.execute(clear.interaction, context);
    expect(context.settings.get('guild-1').mentionRoleId).toBeNull();
    expect(clear.messages().join(' ')).toContain('keine Rolle');
  });

  it('accepts a valid time zone and rejects an invalid one', async () => {
    const context = createTestContext();

    const valid = createFakeCommandInteraction({
      subcommand: 'timezone',
      manageGuild: true,
      strings: { timezone: 'America/New_York' },
    });
    await pickupConfigCommand.execute(valid.interaction, context);
    expect(context.settings.get('guild-1').timezone).toBe('America/New_York');

    const invalid = createFakeCommandInteraction({
      subcommand: 'timezone',
      manageGuild: true,
      strings: { timezone: 'Europe/Atlantis' },
    });
    await pickupConfigCommand.execute(invalid.interaction, context);
    expect(context.settings.get('guild-1').timezone).toBe('America/New_York');
    expect(invalid.messages().join(' ')).toContain('keine gültige Zeitzone');
  });

  it('shows the current configuration including the admin role', async () => {
    const context = createTestContext();
    context.settings.setPickupChannel('guild-1', 'channel-1');
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);

    const fake = createFakeCommandInteraction({ subcommand: 'show', manageGuild: true });
    await pickupConfigCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('<#channel-1>');
    expect(message).toContain(`<@&${ADMIN_ROLE}>`);
    expect(message).toContain('nicht gesetzt');
    expect(message).toContain('Europe/Berlin');
  });

  it.each([
    ['in', '🔥'],
    ['later', '<:soon:123456789012345678>'],
    ['out', '💀'],
  ])('sets a custom emoji for %s', async (option, emoji) => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'emoji',
      manageGuild: true,
      strings: { option, emoji },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').emojis[option as 'in']).toBe(emoji);
    expect(fake.messages().join(' ')).toContain(emoji);
  });

  it('resets an emoji when none is given', async () => {
    const context = createTestContext();
    context.settings.setChoiceEmoji('guild-1', 'in', '🔥');

    const fake = createFakeCommandInteraction({
      subcommand: 'emoji',
      manageGuild: true,
      strings: { option: 'in' },
    });
    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').emojis.in).toBeNull();
    expect(fake.messages().join(' ')).toContain('✅');
  });

  it('rejects something that is not an emoji', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'emoji',
      manageGuild: true,
      strings: { option: 'in', emoji: 'nope' },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').emojis.in).toBeNull();
    expect(fake.messages().join(' ')).toContain('sieht nicht nach einem Emoji aus');
  });

  it('rejects an unknown option value', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'emoji',
      manageGuild: true,
      strings: { option: 'sideways', emoji: '🔥' },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').emojis.in).toBeNull();
    expect(fake.messages().join(' ')).toContain('schiefgelaufen');
  });

  it('shows configured emojis in the summary', async () => {
    const context = createTestContext();
    context.settings.setChoiceEmoji('guild-1', 'in', '🔥');

    const fake = createFakeCommandInteraction({ subcommand: 'show', manageGuild: true });
    await pickupConfigCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('🔥 Dabei');
    expect(message).toContain('🕗 Später');
    expect(message).toContain('❌ Raus');
  });

  it('autocompletes time zones', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ focused: 'berlin', manageGuild: true });

    await pickupConfigCommand.autocomplete?.(fake.interaction as never, context);

    expect(fake.autocompleteChoices().map((choice) => choice.value)).toContain('Europe/Berlin');
  });
});

describe('/pickup-config steam-channel', () => {
  it('saves the steam watch channel', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'steam-channel',
      manageGuild: true,
      channels: { channel: { id: 'channel-steam' } },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.settings.get('guild-1').steamWatchChannelId).toBe('channel-steam');
    expect(fake.messages().join(' ')).toContain('<#channel-steam>');
  });
});

describe('/pickup-config steam-list', () => {
  it('shows a message when nothing is being watched', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ subcommand: 'steam-list', manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Gerade wird kein Spiel beobachtet');
  });

  it('lists a scheduled game with its release date', async () => {
    const context = createTestContext();
    const id = context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'ELDEN RING',
      status: 'scheduled',
      releaseDate: Temporal.Instant.from('2026-08-14T00:00:00Z').epochMilliseconds,
      releaseDateText: '14 Aug, 2026',
      nextCheckAt: Temporal.Instant.from('2026-08-14T00:00:00Z').epochMilliseconds,
    });
    const fake = createFakeCommandInteraction({ subcommand: 'steam-list', manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('ELDEN RING');
    expect(message).toContain(`#${id}`);
  });

  it('lists a pending game showing the raw steam text', async () => {
    const context = createTestContext();
    context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'Some Upcoming Game',
      status: 'pending',
      releaseDate: null,
      releaseDateText: 'Q2 2026',
      nextCheckAt: 1000,
    });
    const fake = createFakeCommandInteraction({ subcommand: 'steam-list', manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Q2 2026');
  });

  it('falls back to a pending placeholder when there is no date text yet', async () => {
    const context = createTestContext();
    context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'Steam App 1245620',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 1000,
    });
    const fake = createFakeCommandInteraction({ subcommand: 'steam-list', manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('noch kein Datum bekannt');
  });
});

describe('/pickup-config steam-remove', () => {
  it('removes a watched game and reports its name', async () => {
    const context = createTestContext();
    const id = context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 1000,
    });
    const fake = createFakeCommandInteraction({
      subcommand: 'steam-remove',
      manageGuild: true,
      integers: { id: id as number },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.steamWatches.findById(id as number)).toBeUndefined();
    expect(fake.messages().join(' ')).toContain('ELDEN RING');
  });

  it('reports not found for an unknown id', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'steam-remove',
      manageGuild: true,
      integers: { id: 999 },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('keinen beobachteten Eintrag');
  });

  it('does not remove a watch belonging to another guild', async () => {
    const context = createTestContext();
    const id = context.steamWatches.create({
      guildId: 'guild-other',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 1000,
    });
    const fake = createFakeCommandInteraction({
      subcommand: 'steam-remove',
      manageGuild: true,
      integers: { id: id as number },
    });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(context.steamWatches.findById(id as number)).toBeDefined();
    expect(fake.messages().join(' ')).toContain('keinen beobachteten Eintrag');
  });

  it('autocompletes watched games, filtered by the typed query', async () => {
    const context = createTestContext();
    context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 1000,
    });
    context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-2',
      appId: 1091500,
      gameName: 'Cyberpunk 2077',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 1000,
    });
    const fake = createFakeCommandInteraction({
      subcommand: 'steam-remove',
      manageGuild: true,
      focused: 'elden',
    });

    await pickupConfigCommand.autocomplete?.(fake.interaction as never, context);

    const names = fake.autocompleteChoices().map((choice) => choice.name);
    expect(names.some((name) => name.includes('ELDEN RING'))).toBe(true);
    expect(names.some((name) => name.includes('Cyberpunk 2077'))).toBe(false);
  });

  it('autocompletes with no results outside a guild', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      subcommand: 'steam-remove',
      guildId: null,
      focused: '',
    });

    await pickupConfigCommand.autocomplete?.(fake.interaction as never, context);

    expect(fake.autocompleteChoices()).toEqual([]);
  });
});

/** Digs the calendar link button out of a rendered pickup payload. */
const calendarUrlIn = (payload: unknown): string | null => {
  const components = (payload as { components?: { toJSON: () => { components: unknown[] } }[] })
    .components;
  const buttons = (components ?? []).flatMap((row) => row.toJSON().components);
  const link = buttons.find(
    (button): button is { url: string } =>
      typeof button === 'object' && button !== null && 'url' in button,
  );
  return link?.url ?? null;
};

describe('/valo', () => {
  const configured = () => {
    const context = createTestContext();
    context.settings.setPickupChannel('guild-1', 'channel-1');
    context.settings.setMentionRole('guild-1', 'role-1');
    return context;
  };

  const at = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds;

  it('is registered as /valo', () => {
    expect(valoCommand.name).toBe('valo');
  });

  it('refuses when no channel is configured', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ commandName: 'valo' });

    await valoCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('kein Pickup-Kanal');
  });

  it('refuses outside a guild', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ guildId: null });

    await valoCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });

  it('refuses when the channel cannot be posted to', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ sendable: false });

    await valoCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nicht schreiben');
  });

  it('rewrites the message so the calendar link can point at it', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { info: 'Helldivers um halb 9' } });

    await valoCommand.execute(fake.interaction, context);

    const url = calendarUrlIn(fake.edited.at(-1));
    expect(url).not.toBeNull();
    expect(new URL(url ?? '').searchParams.get('details')).toBe(
      'Helldivers um halb 9\n\nOrganisiert über Discord: https://discord.com/channels/guild-1/channel-1/message-1',
    );
  });

  it('leaves the message alone when no time was recognised', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { info: 'brauchen noch 2 leute' } });

    await valoCommand.execute(fake.interaction, context);

    expect(fake.edited).toHaveLength(0);
  });

  it('keeps the pickup when the calendar rewrite fails', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({
      strings: { info: 'Helldivers um halb 9' },
      editFails: true,
    });

    await valoCommand.execute(fake.interaction, context);

    expect(context.pickups.findByMessageId('message-1')).toBeDefined();
    expect(fake.messages().join(' ')).toContain('Pickup gepostet');
  });

  it('posts with no info at all', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction();

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBeNull();
    expect(stored?.note).toBeNull();
    expect(fake.messages().join(' ')).toContain('Pickup gepostet');
  });

  it('pulls a time out of free text and keeps the whole text as the note', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({
      strings: { info: 'wer hat bock auf ranked um halb 9' },
    });

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
    expect(stored?.note).toBe('wer hat bock auf ranked um halb 9');
  });

  it('keeps a long free text intact, including the parts around the time', async () => {
    const info = 'hallo hallo, grosse Spazierrunde (BIG WALK) Sonntag 19 Uhr (oder was anderes idk';
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { info } });

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.note).toBe(info);
    expect(stored?.startsAt).toBe(at('2026-08-02T17:00:00Z'));
  });

  it.each([
    ['20:30', at('2026-07-27T18:30:00Z')],
    ['21 uhr', at('2026-07-27T19:00:00Z')],
    ['in 90 minuten', at('2026-07-27T14:30:00Z')],
    ['morgen 20:30', at('2026-07-28T18:30:00Z')],
  ])('reads %s from the info field', async (info, expected) => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { info } });

    await valoCommand.execute(fake.interaction, context);

    expect(context.pickups.findByMessageId('message-1')?.startsAt).toBe(expected);
  });

  it('keeps free text as a note when it holds no time', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { info: 'brauchen noch 2 leute' } });

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBeNull();
    expect(stored?.note).toBe('brauchen noch 2 leute');
    expect(fake.messages().join(' ')).toContain('keine Uhrzeit gefunden');
  });

  it('does not nag about a missing time when no info was given', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction();

    await valoCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).not.toContain('keine Uhrzeit gefunden');
  });

  it('mentions the configured role', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction();

    await valoCommand.execute(fake.interaction, context);

    expect((fake.sent[0] as { content: string }).content).toBe('<@&role-1>');
  });

  it('rolls back the pickup row when posting fails', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ sendFails: true });

    await valoCommand.execute(fake.interaction, context);

    expect(context.database.prepare('SELECT COUNT(*) AS c FROM pickups').get()?.['c']).toBe(0);
    expect(fake.messages().join(' ')).toContain('nicht schreiben');
  });

  it('ignores a blank info option', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { info: '   ' } });

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBeNull();
    expect(stored?.note).toBeNull();
  });
});

describe('/valo-time', () => {
  const at = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds;

  /** Posts a pickup so there is something to correct afterwards. */
  const posted = async (
    info = 'spazierrunde sonntagabend',
    powerUserIds: readonly string[] = [],
  ) => {
    const context = createTestContext(undefined, powerUserIds);
    context.settings.setPickupChannel('guild-1', 'channel-1');
    const fake = createFakeCommandInteraction({ strings: { info } });
    await valoCommand.execute(fake.interaction, context);
    return context;
  };

  const stored = (context: Awaited<ReturnType<typeof posted>>) =>
    context.pickups.findByMessageId('message-1');

  it('is registered as /valo-time', () => {
    expect(valoTimeCommand.name).toBe('valo-time');
  });

  it('refuses outside a guild', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({ guildId: null, strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });

  it('sets the time on the last posted pickup', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({ strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
    expect(fake.messages().join(' ')).toContain('Zeit geändert');
  });

  it('accepts a weekday with a time', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({ strings: { time: 'Sonntag 20 Uhr' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-08-02T18:00:00Z'));
  });

  it('rewrites the posted embed', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({ strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(fake.edited).toHaveLength(1);
    const payload = fake.edited[0] as { embeds: { data: { description: string } }[] };
    expect(payload.embeds[0]?.data.description).toContain('<t:');
  });

  it('adds the calendar link once a time is filled in afterwards', async () => {
    const context = await posted('Helldivers');
    const fake = createFakeCommandInteraction({ strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    const url = calendarUrlIn(fake.edited.at(-1));
    expect(url).not.toBeNull();
    const params = new URL(url ?? '').searchParams;
    expect(params.get('text')).toBe('Gaming-Session @ Test Guild');
    expect(params.get('dates')).toBe('20260727T183000Z/20260727T203000Z');
    expect(params.get('details')).toBe(
      'Helldivers\n\nOrganisiert über Discord: https://discord.com/channels/guild-1/channel-1/message-1',
    );
  });

  it('drops the calendar link when the new time is unreadable', async () => {
    const context = await posted('Helldivers 20:30');
    const fake = createFakeCommandInteraction({ strings: { time: 'irgendwann halt' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(calendarUrlIn(fake.edited.at(-1))).toBeNull();
  });

  it('keeps the note untouched while changing the time', async () => {
    const context = await posted('grosse Spazierrunde (BIG WALK) Sonntagabend');
    const fake = createFakeCommandInteraction({ strings: { time: 'sonntag 19 uhr' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.note).toBe('grosse Spazierrunde (BIG WALK) Sonntagabend');
  });

  it('replaces a time that was set before', async () => {
    const context = await posted('ranked 20:30');
    const fake = createFakeCommandInteraction({ strings: { time: '21:00' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-07-27T19:00:00Z'));
  });

  it('shows an unreadable time as written and says so', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({ strings: { time: 'irgendwann halt' } });

    await valoTimeCommand.execute(fake.interaction, context);

    const pickup = stored(context);
    expect(pickup?.startsAt).toBeNull();
    expect(pickup?.startsAtText).toBe('irgendwann halt');
    expect(fake.messages().join(' ')).toContain('nicht verstanden');
  });

  it('reports when nothing has been posted yet', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('noch kein Pickup');
  });

  it('refuses a member who did not call the pickup', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({
      userId: 'user-2',
      manageGuild: false,
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBeNull();
    expect(fake.messages().join(' ')).toContain('Nur der Ersteller');
  });

  it("lets an admin correct someone else's pickup", async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({
      userId: 'user-2',
      manageGuild: true,
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
  });

  it('lets a member holding the configured admin role correct a pickup', async () => {
    const context = await posted();
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = createFakeCommandInteraction({
      userId: 'user-2',
      manageGuild: false,
      roleIds: [ADMIN_ROLE],
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
  });

  it('lets a power user correct a pickup', async () => {
    const context = await posted('spazierrunde sonntagabend', ['power-1']);
    const fake = createFakeCommandInteraction({
      userId: 'power-1',
      manageGuild: false,
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
  });

  it('still refuses a member holding some other role', async () => {
    const context = await posted();
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = createFakeCommandInteraction({
      userId: 'user-2',
      manageGuild: false,
      roleIds: ['role-other'],
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBeNull();
    expect(fake.messages().join(' ')).toContain('Nur der Ersteller');
  });

  it('refuses a closed pickup', async () => {
    const context = await posted();
    const pickup = stored(context);
    context.pickups.close(pickup?.id ?? 0, Date.now());
    const fake = createFakeCommandInteraction({ strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBeNull();
    expect(fake.messages().join(' ')).toContain('bereits geschlossen');
  });

  it('leaves the pickup alone when its message is gone', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({
      messageMissing: true,
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBeNull();
    expect(fake.messages().join(' ')).toContain('nicht schreiben');
  });

  it('reports a failed edit', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({ editFails: true, strings: { time: '20:30' } });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nicht schreiben');
  });

  it('picks the newest pickup when several were posted', async () => {
    const context = await posted('erste runde');
    const older = context.pickups.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      creatorId: 'user-1',
      startsAt: null,
      startsAtText: null,
      note: 'alte runde',
    });
    context.pickups.attachMessage(older, 'message-0');
    context.database.prepare('UPDATE pickups SET created_at = 1 WHERE id = ?').run(older);

    const fake = createFakeCommandInteraction({ strings: { time: '20:30' } });
    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
    expect(context.pickups.findById(older)?.startsAt).toBeNull();
  });

  it('ignores a pickup from another guild', async () => {
    const context = await posted();
    const fake = createFakeCommandInteraction({
      guildId: 'guild-2',
      strings: { time: '20:30' },
    });

    await valoTimeCommand.execute(fake.interaction, context);

    expect(stored(context)?.startsAt).toBeNull();
    expect(fake.messages().join(' ')).toContain('noch kein Pickup');
  });
});
