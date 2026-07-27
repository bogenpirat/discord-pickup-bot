import { describe, expect, it } from 'vitest';
import { pickupCommand } from '../../src/commands/pickup.ts';
import { pickupConfigCommand } from '../../src/commands/pickupConfig.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';

describe('/pickup-config', () => {
  it('requires manage guild', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ subcommand: 'show', manageGuild: false });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Server verwalten');
  });

  it('refuses outside a guild', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ guildId: null, manageGuild: true });

    await pickupConfigCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });

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

  it('shows the current configuration', async () => {
    const context = createTestContext();
    context.settings.setPickupChannel('guild-1', 'channel-1');

    const fake = createFakeCommandInteraction({ subcommand: 'show', manageGuild: true });
    await pickupConfigCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('<#channel-1>');
    expect(message).toContain('nicht gesetzt');
    expect(message).toContain('Europe/Berlin');
  });

  it('autocompletes time zones', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({ focused: 'berlin', manageGuild: true });

    await pickupConfigCommand.autocomplete?.(fake.interaction as never, context);

    expect(fake.autocompleteChoices().map((choice) => choice.value)).toContain('Europe/Berlin');
  });
});

describe('/pickup', () => {
  const configured = () => {
    const context = createTestContext();
    context.settings.setPickupChannel('guild-1', 'channel-1');
    context.settings.setMentionRole('guild-1', 'role-1');
    return context;
  };

  it('refuses when no channel is configured', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction();

    await pickupCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('kein Pickup-Kanal');
  });

  it('refuses outside a guild', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ guildId: null });

    await pickupCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });

  it('refuses when the channel cannot be posted to', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ sendable: false });

    await pickupCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nicht schreiben');
  });

  it('posts a pickup and stores the message id', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { time: '20:30', note: 'ranked' } });

    await pickupCommand.execute(fake.interaction, context);

    expect(fake.sent).toHaveLength(1);
    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.note).toBe('ranked');
    expect(stored?.startsAt).toBe(Temporal.Instant.from('2026-07-27T18:30:00Z').epochMilliseconds);
    expect(fake.messages().join(' ')).toContain('Pickup gepostet');
  });

  it('mentions the configured role', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction();

    await pickupCommand.execute(fake.interaction, context);

    expect((fake.sent[0] as { content: string }).content).toBe('<@&role-1>');
  });

  it('posts without a start time when none is given', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction();

    await pickupCommand.execute(fake.interaction, context);

    expect(context.pickups.findByMessageId('message-1')?.startsAt).toBeNull();
  });

  it('falls back to literal text when the time cannot be parsed', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({
      strings: { time: 'kurz nach dem Abendessen' },
    });

    await pickupCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBeNull();
    expect(stored?.startsAtText).toBe('kurz nach dem Abendessen');
    expect(fake.messages().join(' ')).toContain('nicht verstanden');
  });

  it('reads a german colloquial time in the configured zone', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { time: 'halb 9' } });

    await pickupCommand.execute(fake.interaction, context);

    expect(context.pickups.findByMessageId('message-1')?.startsAt).toBe(
      Temporal.Instant.from('2026-07-27T18:30:00Z').epochMilliseconds,
    );
  });

  it('rolls back the pickup row when posting fails', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ sendFails: true });

    await pickupCommand.execute(fake.interaction, context);

    expect(context.database.prepare('SELECT COUNT(*) AS c FROM pickups').get()?.['c']).toBe(0);
    expect(fake.messages().join(' ')).toContain('nicht schreiben');
  });

  it('ignores a blank time option', async () => {
    const context = configured();
    const fake = createFakeCommandInteraction({ strings: { time: '   ' } });

    await pickupCommand.execute(fake.interaction, context);

    const stored = context.pickups.findByMessageId('message-1');
    expect(stored?.startsAt).toBeNull();
    expect(stored?.startsAtText).toBeNull();
  });

  it('autocompletes time suggestions', async () => {
    const context = createTestContext();

    const filtered = createFakeCommandInteraction({ focused: 'halb' });
    await pickupCommand.autocomplete?.(filtered.interaction as never, context);
    expect(filtered.autocompleteChoices().map((choice) => choice.value)).toEqual(['halb 9']);

    const unmatched = createFakeCommandInteraction({ focused: 'zzz' });
    await pickupCommand.autocomplete?.(unmatched.interaction as never, context);
    expect(unmatched.autocompleteChoices().length).toBeGreaterThan(1);
  });
});
