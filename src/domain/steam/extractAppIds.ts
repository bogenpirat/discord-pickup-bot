const APP_LINK = /store\.steampowered\.com\/app\/(\d+)/gi;
const MAX_LINKS_PER_MESSAGE = 5;

export const extractSteamAppIds = (content: string): number[] => {
  const ids = new Set<number>();

  for (const match of content.matchAll(APP_LINK)) {
    ids.add(Number(match[1]));
    if (ids.size >= MAX_LINKS_PER_MESSAGE) {
      break;
    }
  }

  return [...ids];
};
