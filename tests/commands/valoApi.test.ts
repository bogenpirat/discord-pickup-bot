import { describe, expect, it } from 'vitest';
import { valoApiCommand } from '../../src/commands/valoApi.ts';
import type { GameVersion } from '../../src/valorant/types.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';
import { fakeValorantClient } from '../helpers/valorant.ts';

const VERSION: GameVersion = {
  branch: 'live',
  build_date: '2026-07-01T00:00:00Z',
  build_ver: '10.00.00.1234',
  last_checked: '2026-07-27T13:00:00Z',
  region: 'eu',
  version: 1234,
  version_for_api: '10.00.00.1234',
};

const ADMIN_ROLE = 'role-admin';

const statusInteraction = (options: Parameters<typeof createFakeCommandInteraction>[0] = {}) =>
  createFakeCommandInteraction({
    commandName: 'valo-api',
    subcommand: 'status',
    ...options,
  });

const healthyClient = () => fakeValorantClient({ version: { ok: true, value: VERSION } });

describe('/valo-api access control', () => {
  it('refuses a plain member', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: false });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Server verwalten');
    expect(client.calls).toEqual([]);
  });

  it('allows a member with manage server', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Valorant-API:');
  });

  it('allows a power user from the environment', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, ['power-1'], client.client);
    const fake = statusInteraction({ userId: 'power-1' });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Valorant-API:');
  });

  it('allows the role configured through /pickup-config admin-role', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = statusInteraction({ roleIds: [ADMIN_ROLE] });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Valorant-API:');
  });

  it('refuses outside a guild', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ guildId: null, manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });
});

describe('/valo-api status', () => {
  it('refuses when no api key is configured', async () => {
    const context = createTestContext();
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('VALORANT_API_KEY');
  });

  it('probes the api and reports the game version', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    expect(client.calls).toEqual([['getVersion', 'eu']]);
    expect(fake.messages().join(' ')).toContain('10.00.00.1234');
  });

  it('defers before probing', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.calls[0]?.method).toBe('deferReply');
  });

  it('reports the rate-limit usage', async () => {
    const client = fakeValorantClient({
      version: { ok: true, value: VERSION },
      stats: { used: 4, limit: 30, waiting: 2, requests: 12, failures: 1, rateLimitHits: 3 },
    });
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('4/30');
    expect(message).toContain('2 wartend');
    expect(message).toContain('12 Anfragen, 1 Fehler, 3× 429');
  });

  it('says the limiter is not blocked when it is idle', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('Gesperrt:** nein');
    expect(message).toContain('Letztes 429:** nie');
  });

  it('reports an active 429 penalty as a timestamp', async () => {
    const client = fakeValorantClient({
      version: { ok: true, value: VERSION },
      stats: { blockedUntil: 1_800_000_000_000, lastRateLimitedAt: 1_700_000_000_000 },
    });
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('Gesperrt:** ja, bis <t:1800000000:R>');
    expect(message).toContain('Letztes 429:** <t:1700000000:R>');
  });

  it('reports a failing probe without failing the command', async () => {
    const client = fakeValorantClient({ version: { ok: false, error: { kind: 'unauthorized' } } });
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true });

    await valoApiCommand.execute(fake.interaction, context);

    const message = fake.messages().join(' ');
    expect(message).toContain('⚠️');
    expect(message).toContain('abgelehnt');
  });

  it('answers in english for an english client', async () => {
    const client = healthyClient();
    const context = createTestContext(undefined, [], client.client);
    const fake = statusInteraction({ manageGuild: true, locale: 'en-GB' });

    await valoApiCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Valorant API:');
  });
});
