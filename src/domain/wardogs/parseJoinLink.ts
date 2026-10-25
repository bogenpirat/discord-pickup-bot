import { z } from 'zod';

export type JoinLinkResult =
  | { readonly kind: 'link'; readonly link: string; readonly name: string | null }
  | { readonly kind: 'invalid' };

/**
 * Only a Steam lobby link is passed on. The bot redirects members' browsers to
 * whatever this returns, so anything else the site might answer with — another
 * scheme, a web URL — is treated as a broken response rather than followed.
 */
const STEAM_LOBBY_LINK = /^steam:\/\/joinlobby\/\d+\/\d+$/;

const responseSchema = z.object({
  link: z.string().regex(STEAM_LOBBY_LINK),
  name: z.string().nullish(),
});

/** Reads `/discord/api/join`'s answer: `{ link: "steam://joinlobby/<app>/<lobby>", name }`. */
export const parseJoinLinkResponse = (body: unknown): JoinLinkResult => {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: 'invalid' };
  }
  const name = parsed.data.name?.trim() ?? '';
  return { kind: 'link', link: parsed.data.link, name: name === '' ? null : name };
};
