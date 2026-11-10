import { ChannelType, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createGuildDirectory } from '../../src/discord/guildDirectory.ts';

const keyed = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

const guild = (id: string, name: string, icon: string | null = null) => ({
  id,
  name,
  iconURL: ({ size }: { size: number }) => (icon === null ? null : `${icon}?size=${size}`),
  channels: {
    cache: keyed([
      { id: 'voice', name: 'Voice', type: ChannelType.GuildVoice, rawPosition: 0 },
      { id: 'news', name: 'news', type: ChannelType.GuildAnnouncement, rawPosition: 2 },
      { id: 'general', name: 'general', type: ChannelType.GuildText, rawPosition: 1 },
      { id: 'cat', name: 'Category', type: ChannelType.GuildCategory, rawPosition: 0 },
    ]),
  },
  roles: {
    cache: keyed([
      { id, name: '@everyone', managed: false, position: 0 },
      { id: 'low', name: 'Member', managed: false, position: 1 },
      { id: 'bot', name: 'Pickup Bot', managed: true, position: 5 },
      { id: 'high', name: 'Mods', managed: false, position: 4 },
    ]),
  },
});

const client = (...guilds: ReturnType<typeof guild>[]) =>
  ({ guilds: { cache: keyed(guilds) } }) as unknown as Pick<Client, 'guilds'>;

describe('createGuildDirectory', () => {
  it('lists the guilds by name', () => {
    const directory = createGuildDirectory(
      client(guild('2', 'zeta'), guild('1', 'Alpha', 'https://cdn.discordapp.com/icons/1/a.png')),
    );

    expect(directory.list()).toEqual([
      { id: '1', name: 'Alpha', iconUrl: 'https://cdn.discordapp.com/icons/1/a.png?size=64' },
      { id: '2', name: 'zeta', iconUrl: null },
    ]);
  });

  it('offers text and announcement channels in sidebar order', () => {
    const detail = createGuildDirectory(client(guild('1', 'Alpha'))).find('1');

    expect(detail?.channels).toEqual([
      { id: 'general', name: 'general', kind: 'text' },
      { id: 'news', name: 'news', kind: 'announcement' },
    ]);
  });

  it('offers roles a person can hold, highest first', () => {
    const detail = createGuildDirectory(client(guild('1', 'Alpha'))).find('1');

    expect(detail?.roles).toEqual([
      { id: 'high', name: 'Mods' },
      { id: 'low', name: 'Member' },
    ]);
  });

  it('knows nothing of a guild the bot is not in', () => {
    expect(createGuildDirectory(client()).find('1')).toBeNull();
  });
});
