import { DatabaseSync } from 'node:sqlite';
import {
  ApplicationCommandOptionType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type CommandInteractionOption,
  type RepliableInteraction,
} from 'discord.js';
import { type AppContext, createAppContext } from '../../src/app/context.ts';
import { type AuditTrail, createAuditTrail } from '../../src/audit/trail.ts';
import type { AuditEntry } from '../../src/audit/types.ts';
import { migrate } from '../../src/db/migrations.ts';
import type { Logger } from '../../src/logger.ts';
import type { ValorantClient } from '../../src/valorant/client.ts';

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

export interface RecordingAuditTrail {
  readonly audit: AuditTrail;
  readonly lines: string[];
  readonly entries: () => AuditEntry[];
}

/** An audit trail that keeps the lines it would have written. */
export const recordingAuditTrail = (): RecordingAuditTrail => {
  const lines: string[] = [];
  let clock = 0;

  return {
    // A clock that ticks once per read keeps `durationMs` non-zero and stable.
    audit: createAuditTrail({
      write: (line) => {
        lines.push(line);
      },
      now: () => {
        clock += 1;
        return clock;
      },
    }),
    lines,
    entries: () => lines.map((line) => JSON.parse(line) as AuditEntry),
  };
};

export interface TestContext extends AppContext {
  readonly database: DatabaseSync;
}

export const createTestContext = (
  now = Temporal.Instant.from('2026-07-27T13:00:00Z'),
  powerUserIds: readonly string[] = [],
  valorant: ValorantClient | null = null,
  audit?: AuditTrail,
): TestContext => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migrate(database);

  const context = createAppContext(database, silentLogger(), powerUserIds, null, valorant, audit);
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
    channelId: 'channel-1',
    guild: guildId === null ? null : { name: options.guildName ?? 'Test Guild' },
    user: { id: options.userId ?? 'user-1', username: options.userId ?? 'user-1' },
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
  readonly users?: Readonly<Record<string, { id: string } | null>>;
  readonly focused?: string;
  /** The channel the command was used in. */
  readonly channelId?: string;
  /** Channels `guild.channels.fetch` cannot resolve. */
  readonly missingChannelIds?: readonly string[];
  /** Channels the bot is not allowed to write in. */
  readonly unsendableChannelIds?: readonly string[];
  readonly messageId?: string;
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

  const messageId = options.messageId ?? 'message-1';
  const invokedChannelId = options.channelId ?? 'channel-1';

  const messageIn = (channelId: string) => ({
    id: messageId,
    url: `https://discord.com/channels/${guildId ?? 'guild-1'}/${channelId}/${messageId}`,
    edit: async (payload: unknown) => {
      if (options.editFails === true) {
        throw new Error('cannot edit');
      }
      edited.push(payload);
      return undefined;
    },
  });

  /** Every channel behaves the same unless a test singles one out by id. */
  const channelFor = (channelId: string) => ({
    id: channelId,
    isTextBased: () => true,
    isSendable: () =>
      (options.sendable ?? true) && !(options.unsendableChannelIds ?? []).includes(channelId),
    messages: {
      fetch: async (wanted: string) => {
        if (options.messageMissing === true || wanted !== messageId) {
          throw new Error('unknown message');
        }
        return messageIn(channelId);
      },
    },
    send: async (payload: unknown) => {
      if (options.sendFails === true) {
        throw new Error('cannot send');
      }
      sent.push(payload);
      return messageIn(channelId);
    },
  });

  const channels = {
    fetch: async (channelId: string) =>
      (options.missingChannelIds ?? []).includes(channelId) ? null : channelFor(channelId),
  };

  /**
   * What discord.js would have put on `interaction.options.data` for the options
   * this fake was given: leaves at the top level, or nested under a subcommand.
   * Only what a test passed shows up, the same way an unsupplied option does not.
   */
  const optionData = (): CommandInteractionOption[] => {
    const leaves: CommandInteractionOption[] = [];

    const add = (
      source: Readonly<Record<string, unknown>> | undefined,
      type: ApplicationCommandOptionType,
      read: (raw: NonNullable<unknown>) => string | number | boolean,
    ): void => {
      for (const [name, raw] of Object.entries(source ?? {})) {
        if (raw !== null && raw !== undefined) {
          leaves.push({ name, type, value: read(raw) } as CommandInteractionOption);
        }
      }
    };

    const identity = (raw: NonNullable<unknown>) => raw as string | number;
    const snowflake = (raw: NonNullable<unknown>) => (raw as { id: string }).id;

    add(options.strings, ApplicationCommandOptionType.String, identity);
    add(options.integers, ApplicationCommandOptionType.Integer, identity);
    add(options.channels, ApplicationCommandOptionType.Channel, snowflake);
    add(options.roles, ApplicationCommandOptionType.Role, snowflake);
    add(options.users, ApplicationCommandOptionType.User, snowflake);

    return options.subcommand === undefined
      ? leaves
      : [
          {
            name: options.subcommand,
            type: ApplicationCommandOptionType.Subcommand,
            options: leaves,
          } as CommandInteractionOption,
        ];
  };

  const interaction = {
    commandName: options.commandName ?? 'pickup',
    locale: options.locale ?? 'de',
    guildId,
    channelId: invokedChannelId,
    channel: channelFor(invokedChannelId),
    user: { id: options.userId ?? 'user-1', username: options.userId ?? 'user-1' },
    memberPermissions: permissions(options.manageGuild ?? false),
    member: guildId === null ? null : { roles: [...(options.roleIds ?? [])] },
    guild: guildId === null ? null : { name: options.guildName ?? 'Test Guild', channels },
    inGuild: () => guildId !== null,
    get deferred() {
      return state.deferred;
    },
    get replied() {
      return state.replied;
    },
    options: {
      data: optionData(),
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
      getUser: (name: string) => options.users?.[name] ?? null,
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
