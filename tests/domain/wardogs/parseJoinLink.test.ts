import { describe, expect, it } from 'vitest';
import { parseJoinLinkResponse } from '../../../src/domain/wardogs/parseJoinLink.ts';

const LINK = 'steam://joinlobby/1867240/109775242246499170';

describe('parseJoinLinkResponse', () => {
  it('reads the link and server name', () => {
    expect(
      parseJoinLinkResponse({
        link: LINK,
        name: 'TEG.gg - EU#1 - ENGLISH - The Employed Gamers',
      }),
    ).toEqual({
      kind: 'link',
      link: LINK,
      name: 'TEG.gg - EU#1 - ENGLISH - The Employed Gamers',
    });
  });

  it.each([undefined, null, '', '  '])('leaves the name out when it is %j', (name) => {
    expect(parseJoinLinkResponse({ link: LINK, name })).toEqual({
      kind: 'link',
      link: LINK,
      name: null,
    });
  });

  it.each([
    'https://evil.example/steam',
    'steam://run/1867240',
    'javascript:alert(1)',
    `${LINK}"><script>`,
  ])('refuses %j as a link', (link) => {
    expect(parseJoinLinkResponse({ link })).toEqual({ kind: 'invalid' });
  });

  it.each([null, {}, { error: 'not_found' }, 'steam://joinlobby/1/2'])('refuses %j', (body) => {
    expect(parseJoinLinkResponse(body)).toEqual({ kind: 'invalid' });
  });
});
