import { describe, expect, it } from 'vitest';
import { playerCardImageUrl } from '../../../src/domain/valorant/media.ts';

const CARD = '2ee6d025-4aac-3a67-0f6e-dba827acc75f';

describe('a player card’s artwork', () => {
  it('builds the square crop by default, which is the profile picture', () => {
    expect(playerCardImageUrl(CARD)).toBe(
      `https://media.valorant-api.com/playercards/${CARD}/smallart.png`,
    );
  });

  it('offers the other crops the mirror publishes', () => {
    expect(playerCardImageUrl(CARD, 'wide')).toBe(
      `https://media.valorant-api.com/playercards/${CARD}/wideart.png`,
    );
    expect(playerCardImageUrl(CARD, 'large')).toBe(
      `https://media.valorant-api.com/playercards/${CARD}/largeart.png`,
    );
  });

  it('answers nothing when there is no card to picture', () => {
    expect(playerCardImageUrl(null)).toBeNull();
    expect(playerCardImageUrl(undefined)).toBeNull();
    expect(playerCardImageUrl('')).toBeNull();
  });

  it('refuses anything that is not a plain uuid, rather than putting it in a URL', () => {
    expect(playerCardImageUrl('card-1')).toBeNull();
    expect(playerCardImageUrl(`../../${CARD}`)).toBeNull();
    expect(playerCardImageUrl(`${CARD}/../../x`)).toBeNull();
  });
});
