import { ChannelType, type Client } from 'discord.js';

export interface DirectoryGuild {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

export interface DirectoryChannel {
  readonly id: string;
  readonly name: string;
  readonly kind: 'text' | 'announcement';
}

export interface DirectoryRole {
  readonly id: string;
  readonly name: string;
}

export interface DirectoryGuildDetail extends DirectoryGuild {
  /** Channels a pickup or a Steam link can live in, in sidebar order. */
  readonly channels: readonly DirectoryChannel[];
  /** Roles a person could hold, highest first. */
  readonly roles: readonly DirectoryRole[];
}

/**
 * What the web console needs to know about the servers the bot sits in. Read
 * from the gateway cache, so it costs no requests and is only as fresh as the
 * last event Discord sent.
 */
export interface GuildDirectory {
  list(): readonly DirectoryGuild[];
  find(guildId: string): DirectoryGuildDetail | null;
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const createGuildDirectory = (client: Pick<Client, 'guilds'>): GuildDirectory => {
  const summarise = (guild: {
    id: string;
    name: string;
    iconURL(options: { size: 64 }): string | null;
  }): DirectoryGuild => ({ id: guild.id, name: guild.name, iconUrl: guild.iconURL({ size: 64 }) });

  return {
    list: () => [...client.guilds.cache.values()].map(summarise).sort(byName),

    find: (guildId) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild === undefined) {
        return null;
      }

      const channels = [...guild.channels.cache.values()]
        .filter(
          (channel) =>
            channel.type === ChannelType.GuildText ||
            channel.type === ChannelType.GuildAnnouncement,
        )
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(
          (channel): DirectoryChannel => ({
            id: channel.id,
            name: channel.name,
            kind: channel.type === ChannelType.GuildAnnouncement ? 'announcement' : 'text',
          }),
        );

      // @everyone shares the guild's id and integration roles belong to bots;
      // neither is something a person would be pinged as or handed config with.
      const roles = [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map((role): DirectoryRole => ({ id: role.id, name: role.name }));

      return { ...summarise(guild), channels, roles };
    },
  };
};
