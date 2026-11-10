/**
 * The console lives at the root of the bot's `/pickup` prefix, the one path a
 * reverse proxy forwards, so it needs no routing of its own on the proxy.
 */
export const ADMIN_BASE_PATH = '/pickup';

export const loginPath = (): string => `${ADMIN_BASE_PATH}/login`;
export const logoutPath = (): string => `${ADMIN_BASE_PATH}/logout`;
export const guildPath = (guildId: string): string => `${ADMIN_BASE_PATH}/guilds/${guildId}`;
export const steamWatchRemovePath = (guildId: string, watchId: number): string =>
  `${guildPath(guildId)}/steam-watches/${watchId}/remove`;

const SNOWFLAKE = String.raw`\d{17,20}`;

export const INDEX_PATTERN = /^\/pickup\/?$/;
export const LOGIN_PATTERN = /^\/pickup\/login$/;
export const LOGOUT_PATTERN = /^\/pickup\/logout$/;
export const GUILD_PATTERN = new RegExp(String.raw`^\/pickup\/guilds\/(${SNOWFLAKE})$`);
export const STEAM_WATCH_REMOVE_PATTERN = new RegExp(
  String.raw`^\/pickup\/guilds\/(${SNOWFLAKE})\/steam-watches\/(\d+)\/remove$`,
);
