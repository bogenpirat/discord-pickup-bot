import { DatabaseSync } from 'node:sqlite';
import { GatewayIntentBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createAppContext } from '../../src/app/context.ts';
import { buildButtonRegistry, buildCommandRegistry, COMMANDS } from '../../src/app/registries.ts';
import { migrate } from '../../src/db/migrations.ts';
import { createClient } from '../../src/discord/client.ts';
import { createLogger } from '../../src/logger.ts';
import { silentLogger } from '../helpers/fakes.ts';

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
  it('registers both slash commands with unique names', () => {
    const names = COMMANDS.map((command) => command.name);
    expect(names).toEqual(['valo', 'pickup-config']);
    expect(new Set(names).size).toBe(names.length);
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
  });

  it('does not gate the config command behind default member permissions', () => {
    const config = COMMANDS.find((command) => command.name === 'pickup-config');
    const definition = config?.definition as { default_member_permissions?: string | null };

    expect(definition.default_member_permissions ?? null).toBeNull();
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
  it('requests only the guilds intent', async () => {
    const client = createClient();

    expect(client.options.intents.has(GatewayIntentBits.Guilds)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(false);
    expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(false);

    await client.destroy();
  });
});
