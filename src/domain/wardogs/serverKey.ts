const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PREFIX = 'id|';

/**
 * The `/api/server-detail` key for a community server's join code: `id|<guid>`.
 * Members copying the key straight off the site paste the prefix along, so it is
 * accepted too. Official servers' in-game ids are not recorded by the site at
 * all, so there is nothing else worth accepting.
 */
export const parseServerKey = (input: string): string | null => {
  const trimmed = input.trim();
  const guid = trimmed.toLowerCase().startsWith(KEY_PREFIX)
    ? trimmed.slice(KEY_PREFIX.length)
    : trimmed;

  return GUID.test(guid) ? `${KEY_PREFIX}${guid.toLowerCase()}` : null;
};

/** The join code inside a key `parseServerKey` built. */
export const serverKeyGuid = (key: string): string => key.slice(KEY_PREFIX.length);
