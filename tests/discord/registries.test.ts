import { describe, expect, it, vi } from 'vitest';
import { aliasCommand } from '../../src/discord/aliasCommand.ts';
import { createButtonRegistry } from '../../src/discord/buttonRegistry.ts';
import { createCommandRegistry } from '../../src/discord/commandRegistry.ts';
import { encodeClose, encodeRespond } from '../../src/discord/customId.ts';
import { replyEphemeral } from '../../src/discord/reply.ts';
import type { SlashCommand } from '../../src/discord/types.ts';
import {
  asRepliable,
  createFakeButtonInteraction,
  createFakeCommandInteraction,
  createTestContext,
} from '../helpers/fakes.ts';

const stubCommand = (overrides: Partial<SlashCommand> = {}): SlashCommand => ({
  name: 'pickup',
  definition: { name: 'pickup', description: 'stub' },
  execute: async () => undefined,
  ...overrides,
});

describe('commandRegistry', () => {
  it('exposes one definition per command', () => {
    const registry = createCommandRegistry([stubCommand(), stubCommand({ name: 'other' })]);
    expect(registry.definitions).toHaveLength(2);
  });

  it('dispatches to the matching command', async () => {
    const execute = vi.fn(async () => undefined);
    const registry = createCommandRegistry([stubCommand({ execute })]);
    const fake = createFakeCommandInteraction({ commandName: 'pickup' });

    await registry.dispatch(fake.interaction, createTestContext());

    expect(execute).toHaveBeenCalledOnce();
  });

  it('ignores an unknown command', async () => {
    const registry = createCommandRegistry([stubCommand()]);
    const fake = createFakeCommandInteraction({ commandName: 'ghost' });

    await registry.dispatch(fake.interaction, createTestContext());

    expect(fake.calls).toHaveLength(0);
  });

  it('replies with a friendly error when a command throws', async () => {
    const registry = createCommandRegistry([
      stubCommand({
        execute: async () => {
          throw new Error('boom');
        },
      }),
    ]);
    const fake = createFakeCommandInteraction({ commandName: 'pickup' });

    await registry.dispatch(fake.interaction, createTestContext());

    expect(fake.messages().join(' ')).toContain('schiefgelaufen');
  });

  it('stays quiet when even the error reply fails', async () => {
    const registry = createCommandRegistry([
      stubCommand({
        execute: async () => {
          throw new Error('boom');
        },
      }),
    ]);
    const fake = createFakeCommandInteraction({ commandName: 'pickup', replyFails: true });

    await expect(registry.dispatch(fake.interaction, createTestContext())).resolves.toBeUndefined();
  });

  it('dispatches autocomplete only when the command implements it', async () => {
    const autocomplete = vi.fn(async () => undefined);
    const registry = createCommandRegistry([
      stubCommand({ autocomplete }),
      stubCommand({ name: 'plain' }),
    ]);

    await registry.dispatchAutocomplete(
      createFakeCommandInteraction({ commandName: 'pickup' }).interaction as never,
      createTestContext(),
    );
    await registry.dispatchAutocomplete(
      createFakeCommandInteraction({ commandName: 'plain' }).interaction as never,
      createTestContext(),
    );
    await registry.dispatchAutocomplete(
      createFakeCommandInteraction({ commandName: 'ghost' }).interaction as never,
      createTestContext(),
    );

    expect(autocomplete).toHaveBeenCalledOnce();
  });

  it('swallows autocomplete failures', async () => {
    const registry = createCommandRegistry([
      stubCommand({
        autocomplete: async () => {
          throw new Error('boom');
        },
      }),
    ]);

    await expect(
      registry.dispatchAutocomplete(
        createFakeCommandInteraction({ commandName: 'pickup' }).interaction as never,
        createTestContext(),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('aliasCommand', () => {
  it('keeps the definition apart from the name', () => {
    const original = stubCommand({
      definition: {
        name: 'pickup',
        description: 'stub',
        options: [{ type: 3, name: 'info', description: 'free text' }],
      },
    });

    const alias = aliasCommand(original, 'valo');
    const definition = alias.definition as { description?: string; options?: unknown[] };

    expect(alias.name).toBe('valo');
    expect(alias.definition.name).toBe('valo');
    expect(definition.description).toBe('stub');
    expect(definition.options).toEqual((original.definition as { options?: unknown[] }).options);
    expect(original.definition.name).toBe('pickup');
  });

  it('drops localized names, which belong to the original name', () => {
    const original = stubCommand({
      definition: {
        name: 'pickup',
        description: 'stub',
        name_localizations: { de: 'abholen' },
      },
    });

    expect(aliasCommand(original, 'valo').definition.name_localizations).toBeNull();
  });

  it('shares the handlers with the original', async () => {
    const execute = vi.fn(async () => undefined);
    const autocomplete = vi.fn(async () => undefined);
    const registry = createCommandRegistry([
      stubCommand({ execute, autocomplete }),
      aliasCommand(stubCommand({ execute, autocomplete }), 'valo'),
    ]);
    const context = createTestContext();

    await registry.dispatch(
      createFakeCommandInteraction({ commandName: 'valo' }).interaction,
      context,
    );
    await registry.dispatchAutocomplete(
      createFakeCommandInteraction({ commandName: 'valo' }).interaction as never,
      context,
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(autocomplete).toHaveBeenCalledOnce();
  });
});

describe('buttonRegistry', () => {
  const handlers = () => ({
    respond: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  });

  it('routes respond and close to their handlers', async () => {
    const spies = handlers();
    const registry = createButtonRegistry(spies);
    const context = createTestContext();

    await registry.dispatch(
      createFakeButtonInteraction({ customId: encodeRespond('in', 1) }).interaction,
      context,
    );
    await registry.dispatch(
      createFakeButtonInteraction({ customId: encodeClose(1) }).interaction,
      context,
    );

    expect(spies.respond).toHaveBeenCalledOnce();
    expect(spies.close).toHaveBeenCalledOnce();
  });

  it('ignores components from another namespace', async () => {
    const spies = handlers();
    const registry = createButtonRegistry(spies);

    await registry.dispatch(
      createFakeButtonInteraction({ customId: 'other:thing' }).interaction,
      createTestContext(),
    );

    expect(spies.respond).not.toHaveBeenCalled();
    expect(spies.close).not.toHaveBeenCalled();
  });

  it('ignores a malformed pickup custom id', async () => {
    const spies = handlers();
    const registry = createButtonRegistry(spies);

    await registry.dispatch(
      createFakeButtonInteraction({ customId: 'pickup:respond:in:abc' }).interaction,
      createTestContext(),
    );

    expect(spies.respond).not.toHaveBeenCalled();
  });

  it('stays quiet when even the error reply fails', async () => {
    const registry = createButtonRegistry({
      respond: async () => {
        throw new Error('boom');
      },
      close: async () => undefined,
    });
    const fake = createFakeButtonInteraction({
      customId: encodeRespond('in', 1),
      replyFails: true,
    });

    await expect(registry.dispatch(fake.interaction, createTestContext())).resolves.toBeUndefined();
  });

  it('reports a handler failure to the user', async () => {
    const registry = createButtonRegistry({
      respond: async () => {
        throw new Error('boom');
      },
      close: async () => undefined,
    });
    const fake = createFakeButtonInteraction({ customId: encodeRespond('in', 1) });

    await registry.dispatch(fake.interaction, createTestContext());

    expect(fake.ephemeralMessages().join(' ')).toContain('schiefgelaufen');
  });
});

describe('replyEphemeral', () => {
  it('replies when the interaction is untouched', async () => {
    const fake = createFakeButtonInteraction();
    await replyEphemeral(asRepliable(fake), 'hello');
    expect(fake.calls.map((call) => call.method)).toEqual(['reply']);
  });

  it('follows up once the interaction is deferred', async () => {
    const fake = createFakeButtonInteraction();
    await fake.interaction.deferUpdate();
    await replyEphemeral(asRepliable(fake), 'hello');
    expect(fake.calls.map((call) => call.method)).toEqual(['deferUpdate', 'followUp']);
  });

  it('follows up once the interaction has replied', async () => {
    const fake = createFakeButtonInteraction();
    await replyEphemeral(asRepliable(fake), 'first');
    await replyEphemeral(asRepliable(fake), 'second');
    expect(fake.calls.map((call) => call.method)).toEqual(['reply', 'followUp']);
  });
});
