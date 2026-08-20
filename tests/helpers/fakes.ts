import { DatabaseSync } from 'node:sqlite';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  RepliableInteraction,
} from 'discord.js';
import { type AppContext, createAppContext } from '../../src/app/context.ts';
import { migrate } from '../../src/db/migrations.ts';
import type { Logger } from '../../src/logger.ts';

export const silentLogger = (): Logger =>
  ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    fatal: () => undefined,
  }) as unknown as Logger;

export interface LogRecord {
  readonly level: string;
  readonly fields: Record<string, unknown>;
  readonly message: string;
}

export interface RecordingLogger {
  readonly logger: Logger;
  readonly records: LogRecord[];
  readonly messages: (level?: string) => string[];
  readonly find: (message: string) => LogRecord | undefined;
}

/** A logger that keeps every call, so tests can assert on what was logged. */
export const recordingLogger = (): RecordingLogger => {
  const records: LogRecord[] = [];

  const record =
    (level: string) =>
    (first: unknown, second?: unknown): undefined => {
      records.push(
        typeof first === 'string'
          ? { level, fields: {}, message: first }
          : { level, fields: (first ?? {}) as Record<string, unknown>, message: String(second) },
      );
      return undefined;
    };

  return {
    logger: {
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
      debug: record('debug'),
      trace: record('trace'),
      fatal: record('fatal'),
    } as unknown as Logger,
    records,
    messages: (level) =>
      records.filter((entry) => level === undefined || entry.level === level).map((e) => e.message),
    find: (message) => records.find((entry) => entry.message === message),
  };
};

export interface TestContext extends AppContext {
  readonly database: DatabaseSync;
}

export const createTestContext = (
  now = Temporal.Instant.from('2026-07-27T13:00:00Z'),
  powerUserIds: readonly string[] = [],
): TestContext => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migrate(database);

  const context = createAppContext(database, silentLogger(), powerUserIds);
  return { ...context, now: () => now, database };
};

export interface RecordedCall {
  readonly method: string;
  readonly payload: unknown;
}

export interface FakeInteractionOptions {
  readonly userId?: string;
  readonly locale?: string;
  readonly manageGuild?: boolean;
  readonly guildId?: string | null;
  readonly customId?: string;
  readonly guildName?: string;
  readonly replyFails?: boolean;
  readonly roleIds?: readonly string[];
  readonly powerUserIds?: readonly string[];
}

export interface FakeButtonInteraction {
  readonly interaction: ButtonInteraction;
  readonly calls: RecordedCall[];
  readonly editedWith: () => unknown;
  readonly ephemeralMessages: () => string[];
}

const permissions = (manageGuild: boolean) => ({ has: () => manageGuild });

export const createFakeButtonInteraction = (
  options: FakeInteractionOptions = {},
): FakeButtonInteraction => {
  const calls: RecordedCall[] = [];
  const state = { deferred: false, replied: false };

  const record = (method: string) => async (payload: unknown) => {
    calls.push({ method, payload });
    if (options.replyFails === true) {
      throw new Error(`${method} failed`);
    }
    return undefined;
  };

  const guildId = options.guildId === undefined ? 'guild-1' : options.guildId;

  const interaction = {
    customId: options.customId ?? 'pickup:respond:in:1',
    locale: options.locale ?? 'de',
    guildId,
    guild: guildId === null ? null : { name: options.guildName ?? 'Test Guild' },
    user: { id: options.userId ?? 'user-1' },
    memberPermissions: permissions(options.manageGuild ?? false),
    get deferred() {
      return state.deferred;
    },
    get replied() {
      return state.replied;
    },
    deferUpdate: async () => {
      state.deferred = true;
      calls.push({ method: 'deferUpdate', payload: undefined });
    },
    editReply: record('editReply'),
    followUp: record('followUp'),
    reply: async (payload: unknown) => {
      state.replied = true;
      calls.push({ method: 'reply', payload });
      if (options.replyFails === true) {
        throw new Error('reply failed');
      }
    },
  };

  return {
    interaction: interaction as unknown as ButtonInteraction,
    calls,
    editedWith: () => calls.filter((call) => call.method === 'editReply').at(-1)?.payload,
    ephemeralMessages: () =>
      calls
        .filter((call) => call.method === 'followUp' || call.method === 'reply')
        .map((call) => {
          const payload = call.payload;
          return typeof payload === 'object' && payload !== null && 'content' in payload
            ? String((payload as { content: unknown }).content)
            : '';
        }),
  };
};

export interface FakeCommandOptions extends FakeInteractionOptions {
  readonly commandName?: string;
  readonly subcommand?: string;
  readonly strings?: Readonly<Record<string, string | null>>;
  readonly integers?: Readonly<Record<string, number | null>>;
  readonly channels?: Readonly<Record<string, { id: string } | null>>;
  readonly roles?: Readonly<Record<string, { id: string } | null>>;
  readonly focused?: string;
  readonly sendable?: boolean;
  readonly sendFails?: boolean;
  readonly messageMissing?: boolean;
  readonly editFails?: boolean;
}

export interface FakeCommandInteraction {
  readonly interaction: ChatInputCommandInteraction;
  readonly calls: RecordedCall[];
  readonly sent: unknown[];
  readonly edited: unknown[];
  readonly messages: () => string[];
  readonly autocompleteChoices: () => { name: string; value: string }[];
}

export const createFakeCommandInteraction = (
  options: FakeCommandOptions = {},
): FakeCommandInteraction => {
  const calls: RecordedCall[] = [];
  const sent: unknown[] = [];
  const edited: unknown[] = [];
  const responded: { name: string; value: string }[][] = [];
  const state = { deferred: false, replied: false };
  const guildId = options.guildId === undefined ? 'guild-1' : options.guildId;

  const postedMessage = {
    id: 'message-1',
    url: 'https://discord.com/channels/guild-1/channel-1/message-1',
    edit: async (payload: unknown) => {
      if (options.editFails === true) {
        throw new Error('cannot edit');
      }
      edited.push(payload);
      return undefined;
    },
  };

  const channel = {
    id: 'channel-1',
    isTextBased: () => true,
    isSendable: () => options.sendable ?? true,
    messages: {
      fetch: async (messageId: string) => {
        if (options.messageMissing === true || messageId !== postedMessage.id) {
          throw new Error('unknown message');
        }
        return postedMessage;
      },
    },
    send: async (payload: unknown) => {
      if (options.sendFails === true) {
        throw new Error('cannot send');
      }
      sent.push(payload);
      return postedMessage;
    },
  };

  const interaction = {
    commandName: options.commandName ?? 'pickup',
    locale: options.locale ?? 'de',
    guildId,
    user: { id: options.userId ?? 'user-1' },
    memberPermissions: permissions(options.manageGuild ?? false),
    member: guildId === null ? null : { roles: [...(options.roleIds ?? [])] },
    guild:
      guildId === null
        ? null
        : { name: options.guildName ?? 'Test Guild', channels: { fetch: async () => channel } },
    inGuild: () => guildId !== null,
    get deferred() {
      return state.deferred;
    },
    get replied() {
      return state.replied;
    },
    options: {
      getSubcommand: () => options.subcommand ?? 'show',
      getString: (name: string, required?: boolean) => {
        const value = options.strings?.[name] ?? null;
        if (value === null && required === true) {
          throw new Error(`missing required option ${name}`);
        }
        return value;
      },
      getChannel: (name: string, required?: boolean) => {
        const value = options.channels?.[name] ?? null;
        if (value === null && required === true) {
          throw new Error(`missing required option ${name}`);
        }
        return value;
      },
      getInteger: (name: string, required?: boolean) => {
        const value = options.integers?.[name] ?? null;
        if (value === null && required === true) {
          throw new Error(`missing required option ${name}`);
        }
        return value;
      },
      getRole: (name: string) => options.roles?.[name] ?? null,
      getFocused: () => options.focused ?? '',
    },
    deferReply: async (payload: unknown) => {
      state.deferred = true;
      calls.push({ method: 'deferReply', payload });
    },
    editReply: async (payload: unknown) => {
      calls.push({ method: 'editReply', payload });
    },
    followUp: async (payload: unknown) => {
      calls.push({ method: 'followUp', payload });
    },
    reply: async (payload: unknown) => {
      state.replied = true;
      calls.push({ method: 'reply', payload });
      if (options.replyFails === true) {
        throw new Error('reply failed');
      }
    },
    respond: async (choices: { name: string; value: string }[]) => {
      responded.push(choices);
    },
  };

  return {
    interaction: interaction as unknown as ChatInputCommandInteraction,
    calls,
    sent,
    edited,
    messages: () =>
      calls.map((call) => {
        const payload = call.payload;
        return typeof payload === 'object' && payload !== null && 'content' in payload
          ? String((payload as { content: unknown }).content)
          : '';
      }),
    autocompleteChoices: () => responded.at(-1) ?? [],
  };
};

export const asRepliable = (interaction: FakeButtonInteraction): RepliableInteraction =>
  interaction.interaction as unknown as RepliableInteraction;
