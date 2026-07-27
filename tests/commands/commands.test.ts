import { describe, expect, it } from 'vitest';
import { pickupConfigCommand } from '../../src/commands/pickupConfig.ts';
import { valoCommand } from '../../src/commands/valo.ts';
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

  it('posts with no info at all', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction();

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBeNull();
    expect(stored?.note).toBeNull();
    expect(fake.messages().join(' ')).toContain('Pickup gepostet');
  });

  it('pulls a time out of free text and keeps the rest as the note', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({
      strings: { info: 'wer hat bock auf ranked um halb 9' },
    });

    await valoCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBe(at('2026-07-27T18:30:00Z'));
    expect(stored?.note).toBe('wer hat bock auf ranked');
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
