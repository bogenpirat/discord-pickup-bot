/** Which `/api/server-detail` query parameter identifies the server, and its value. */
export type ServerRef =
  | { readonly param: 'key'; readonly value: string }
  | { readonly param: 'id'; readonly value: string };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
const KEY_PREFIX = 'id|';

/**
 * A GUID is the server's join code, which the API keys as `id|<guid>`; members
 * copying the key straight off the site paste the prefix along, so it is
 * accepted too. A bare number goes to the `id` parameter instead.
 */
export const parseServerRef = (input: string): ServerRef | null => {
  const trimmed = input.trim();
  const guid = trimmed.toLowerCase().startsWith(KEY_PREFIX)
    ? trimmed.slice(KEY_PREFIX.length)
    : trimmed;

  if (GUID.test(guid)) {
    return { param: 'key', value: `${KEY_PREFIX}${guid.toLowerCase()}` };
  }
  if (NUMERIC.test(trimmed)) {
    return { param: 'id', value: trimmed };
  }
  return null;
};
