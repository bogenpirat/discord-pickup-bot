export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

const supported = (): readonly string[] => Intl.supportedValuesOf('timeZone');

export const isValidTimeZone = (candidate: string): boolean => {
  if (candidate === '') {
    return false;
  }
  try {
    Temporal.Now.zonedDateTimeISO(candidate);
    return true;
  } catch {
    return false;
  }
};

export const searchTimeZones = (query: string, limit: number): readonly string[] => {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
  const zones = supported();

  if (needle === '') {
    return zones.filter((zone) => zone.startsWith('Europe/')).slice(0, limit);
  }

  return zones.filter((zone) => zone.toLowerCase().includes(needle)).slice(0, limit);
};
