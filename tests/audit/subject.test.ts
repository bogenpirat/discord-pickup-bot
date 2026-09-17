import { ApplicationCommandOptionType, type ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { describeButton, describeCommand } from '../../src/audit/subject.ts';
import { createFakeButtonInteraction, createFakeCommandInteraction } from '../helpers/fakes.ts';

/**
 * An interaction carrying option data exactly as given, for the shapes discord.js
 * can produce but this bot's own commands do not — groups, and options that have
 * no value of their own.
 */
const withOptionData = (data: unknown[]): ChatInputCommandInteraction => {
  const { interaction } = createFakeCommandInteraction({ commandName: 'pickup-config' });
  return { ...interaction, options: { data } } as unknown as ChatInputCommandInteraction;
};

const groupedInteraction = (): ChatInputCommandInteraction =>
  withOptionData([
    {
      name: 'steam',
      type: ApplicationCommandOptionType.SubcommandGroup,
      options: [
        {
          name: 'remove',
          type: ApplicationCommandOptionType.Subcommand,
          options: [{ name: 'app-id', type: ApplicationCommandOptionType.Integer, value: 730 }],
        },
      ],
    },
  ]);

describe('describeCommand', () => {
  it('names the command and who ran it', () => {
    const { interaction } = createFakeCommandInteraction({
      commandName: 'elo',
      userId: 'user-9',
      locale: 'en-GB',
      channelId: 'channel-4',
    });

    expect(describeCommand(interaction)).toEqual({
      kind: 'command',
      command: 'elo',
      guildId: 'guild-1',
      channelId: 'channel-4',
      userId: 'user-9',
      user: 'user-9',
      locale: 'en-GB',
      options: {},
    });
  });

  it('records the options that were supplied', () => {
    const { interaction } = createFakeCommandInteraction({
      commandName: 'elo',
      strings: { 'riot-id': 'Foo#EUW', unset: null },
    });

    expect(describeCommand(interaction)).toMatchObject({ options: { 'riot-id': 'Foo#EUW' } });
  });

  it('names the subcommand and flattens its options', () => {
    const { interaction } = createFakeCommandInteraction({
      commandName: 'pickup-config',
      subcommand: 'channel',
      channels: { channel: { id: 'channel-7' } },
    });

    expect(describeCommand(interaction)).toMatchObject({
      command: 'pickup-config',
      subcommand: 'channel',
      options: { channel: 'channel-7' },
    });
  });

  it('joins a subcommand group onto its subcommand', () => {
    expect(describeCommand(groupedInteraction())).toMatchObject({
      subcommand: 'steam remove',
      options: { 'app-id': 730 },
    });
  });

  it('names a group that holds no subcommand after the group itself', () => {
    const interaction = withOptionData([
      { name: 'steam', type: ApplicationCommandOptionType.SubcommandGroup, options: [] },
    ]);

    expect(describeCommand(interaction)).toMatchObject({ subcommand: 'steam', options: {} });
  });

  it('handles a subcommand that carries no options at all', () => {
    const interaction = withOptionData([
      { name: 'show', type: ApplicationCommandOptionType.Subcommand },
    ]);

    expect(describeCommand(interaction)).toMatchObject({ subcommand: 'show', options: {} });
  });

  it('skips an option that has no value of its own', () => {
    const interaction = withOptionData([
      { name: 'riot-id', type: ApplicationCommandOptionType.String, value: 'Foo#EUW' },
      { name: 'attachment', type: ApplicationCommandOptionType.Attachment },
    ]);

    expect(describeCommand(interaction)).toMatchObject({ options: { 'riot-id': 'Foo#EUW' } });
  });

  it('leaves out the subcommand when there is none', () => {
    const { interaction } = createFakeCommandInteraction({ commandName: 'valo' });

    expect(describeCommand(interaction)).not.toHaveProperty('subcommand');
  });

  it('reports a command used outside a guild', () => {
    const { interaction } = createFakeCommandInteraction({ commandName: 'valo', guildId: null });

    expect(describeCommand(interaction)).toMatchObject({ guildId: null });
  });
});

describe('describeButton', () => {
  it('records the choice behind a respond click', () => {
    const { interaction } = createFakeButtonInteraction({ userId: 'user-3' });

    expect(describeButton(interaction, { action: 'respond', choice: 'in', pickupId: 12 })).toEqual({
      kind: 'button',
      action: 'respond',
      pickupId: 12,
      choice: 'in',
      guildId: 'guild-1',
      channelId: 'channel-1',
      userId: 'user-3',
      user: 'user-3',
      locale: 'de',
    });
  });

  it('has no choice to record for a close click', () => {
    const { interaction } = createFakeButtonInteraction();

    const subject = describeButton(interaction, { action: 'close', pickupId: 12 });

    expect(subject).toMatchObject({ action: 'close', pickupId: 12 });
    expect(subject).not.toHaveProperty('choice');
  });
});
