/**
 * Artwork URLs for the entities the API answers with as ids.
 *
 * Riot publishes no image endpoint of its own, and the content dump names
 * entities without picturing them. `media.valorant-api.com` is the community
 * mirror everything uses for this — including HenrikDev, whose v1 account
 * endpoint answers with exactly the URLs built here. Building them from the id
 * costs no request, which is the only reason this bot reads accounts from v2
 * and still shows a picture.
 */

const MEDIA_BASE = 'https://media.valorant-api.com';

/**
 * Which crop of a player card. `small` is the square one Riot uses as a profile
 * picture; `wide` is the banner beside a name, `large` the full portrait.
 */
export type PlayerCardArt = 'small' | 'wide' | 'large';

/**
 * Ids only ever come from an API answer, but they end up inside a URL that
 * Discord will fetch, so anything that is not a plain uuid is refused rather
 * than escaped.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The URL of a player card's artwork, or null when the id is not one — which is
 * also the answer for an account the API sent no card for.
 *
 * The mirror answers 404 for an id it does not know. Discord quietly drops an
 * image it cannot fetch, so a card newer than the mirror costs the picture and
 * nothing else.
 */
export const playerCardImageUrl = (
  cardId: string | null | undefined,
  art: PlayerCardArt = 'small',
): string | null =>
  cardId != null && UUID.test(cardId) ? `${MEDIA_BASE}/playercards/${cardId}/${art}art.png` : null;
