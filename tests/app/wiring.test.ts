import { DatabaseSync } from 'node:sqlite';
import { GatewayIntentBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createAppContext } from '../../src/app/context.ts';
import { buildButtonRegistry, buildCommandRegistry, COMMANDS } from '../../src/app/registries.ts';
import { migrate } from '../../src/db/migrations.ts';
import { createClient } from '../../src/discord/client.ts';
import { createLogger } from '../../src/logger.ts';
import { createFakeCommandInteraction, createTestContext, silentLogger } from '../helpers/fakes.ts';

describe('createAppContext', () => {
  it('wires every repository against the given database', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const context = createAppContext(db, silentLogger());

    context.settings.setPickupChannel('guild-1', 'channel-1');
    expect(context.settings.get('guild-1').pickupChannelId).toBe('channel-1');

    const id = context.pickups.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      creatorId: 'creator-1',
      startsAt: null,
      startsAtText: null,
      note: null,
    });
    context.responses.set(id, 'u1', 'in', 0);
    expect(context.responses.listByPickup(id)).toHaveLength(1);

    context.steamWatches.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      appId: 1245620,
      gameName: 'ELDEN RING',
      status: 'pending',
      releaseDate: null,
      releaseDateText: null,
      nextCheckAt: 0,
    });
    expect(context.steamWatches.listByGuild('guild-1')).toHaveLength(1);

    context.riotAccounts.link(
      {
        discordUserId: 'u1',
        puuid: 'puuid-1',
        riotName: 'Name',
        riotTag: 'EUW',
        region: 'eu',
      },
      1_000,
    );
    expect(context.riotAccounts.find('u1')?.puuid).toBe('puuid-1');

    // No key configured in this wiring, so the client is absent by design.
    expect(context.valorant).toBeNull();

    db.close();
  });

  it('reports the current instant', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const context = createAppContext(db, silentLogger());

    const before = Date.now();
    const now = context.now();

    expect(now.epochMilliseconds).toBeGreaterThanOrEqual(before);
    expect(now.epochMilliseconds).toBeLessThanOrEqual(Date.now());

    db.close();
  });
});

describe('registries', () => {
  it('registers every slash command with unique names', () => {
    const names = COMMANDS.map((command) => command.name);
    expect(names).toEqual([
      'valo',
      'pickup',
      'valo-time',
      'pickup-time',
      'pickup-config',
      'valo-account',
      'valo-api',
      'elo',
      'mmr',
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each([
    ['pickup', 'valo'],
    ['pickup-time', 'valo-time'],
    ['mmr', 'elo'],
  ])('registers /%s as an alias of /%s', (aliasName, originalName) => {
    const alias = COMMANDS.find((command) => command.name === aliasName);
    const original = COMMANDS.find((command) => command.name === originalName);

    expect(alias?.execute).toBe(original?.execute);
    expect(alias?.definition).toEqual({
      ...original?.definition,
      name: aliasName,
      name_localizations: null,
    });
  });

  it('runs the same handler whichever name was used', async () => {
    const registry = buildCommandRegistry();
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      commandName: 'pickup',
      strings: { info: 'ranked um halb 9' },
    });

    await registry.dispatch(fake.interaction, context);

    expect(context.pickups.findByMessageId('message-1')?.note).toBe('ranked um halb 9');
  });

  it('exposes a serialisable definition per command', () => {
    for (const definition of buildCommandRegistry().definitions) {
      expect(definition.name).toBeTruthy();
      expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    }
  });

  it('gives /valo exactly one optional free-text option', () => {
    const valo = COMMANDS.find((command) => command.name === 'valo');
    expect(valo).toBeDefined();

    const definition = valo?.definition as {
      options?: { name: string; required?: boolean }[];
    };

    expect(definition.options).toHaveLength(1);
    expect(definition.options?.[0]?.name).toBe('info');
    expect(definition.options?.[0]?.required ?? false).toBe(false);
  });

  it('localises the config subcommands to german', () => {
    const config = COMMANDS.find((command) => command.name === 'pickup-config');
    const definition = config?.definition as {
      options?: { name: string; name_localizations?: Record<string, string> }[];
    };
    const names = Object.fromEntries(
      (definition.options ?? []).map((option) => [option.name, option.name_localizations?.['de']]),
    );

    expect(names['channel']).toBe('kanal');
    expect(names['admin-role']).toBe('admin-rolle');
    expect(names['timezone']).toBe('zeitzone');
    expect(names['steam-channel']).toBe('steam-kanal');
    expect(names['steam-list']).toBe('steam-liste');
    expect(names['steam-remove']).toBe('steam-entfernen');
  });

  it.each(['pickup-config', 'valo-api'])(
    'does not gate /%s behind default member permissions',
    (name) => {
      const command = COMMANDS.find((entry) => entry.name === name);
      const definition = command?.definition as { default_member_permissions?: string | null };

      // Kept visible on purpose: the command refuses at runtime with a message
      // that explains who may use it, rather than silently disappearing.
      expect(definition.default_member_permissions ?? null).toBeNull();
    },
  );

  it('localises the account subcommands to german', () => {
    const account = COMMANDS.find((command) => command.name === 'valo-account');
    const definition = account?.definition as {
      options?: { name: string; name_localizations?: Record<string, string> }[];
    };
    const names = Object.fromEntries(
      (definition.options ?? []).map((option) => [option.name, option.name_localizations?.['de']]),
    );

    expect(names['link']).toBe('verknüpfen');
    expect(names['show']).toBe('anzeigen');
    expect(names['refresh']).toBe('aktualisieren');
    expect(names['unlink']).toBe('trennen');
  });

  it('builds a button registry that dispatches', async () => {
    const registry = buildButtonRegistry();
    expect(typeof registry.dispatch).toBe('function');
  });
});

describe('createLogger', () => {
  it('applies the requested level without a transport', () => {
    const logger = createLogger('debug', false);
    expect(logger.level).toBe('debug');
  });
});

describe('createClient', () => {
  it('requests guilds, guild messages, and message content, but nothing else privileged', async () => {
    const client = createClient();

    expect(client.options.intents.has(GatewayIntentBits.Guilds)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.GuildMessages)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(false);
    expect(client.options.intents.has(GatewayIntentBits.GuildPresences)).toBe(false);

    await client.destroy();
  });
});
