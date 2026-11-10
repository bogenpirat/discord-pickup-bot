import { describe, expect, it } from 'vitest';
import { parseCookies, serializeCookie } from '../../../src/http/admin/cookies.ts';

describe('parseCookies', () => {
  it('reads every pair', () => {
    const cookies = parseCookies('a=1; pickup_session=abc%2Fdef;b=two');

    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('pickup_session')).toBe('abc/def');
    expect(cookies.get('b')).toBe('two');
  });

  it('keeps the first of a repeated name', () => {
    expect(parseCookies('a=first; a=second').get('a')).toBe('first');
  });

  it('skips fragments that are not pairs, and bad escapes', () => {
    const cookies = parseCookies('junk; =nameless; bad=%E0%A4%A; good=yes');

    expect([...cookies.keys()]).toEqual(['good']);
  });

  it('reads nothing from a missing header', () => {
    expect(parseCookies(undefined).size).toBe(0);
  });
});

describe('serializeCookie', () => {
  it('locks the cookie down', () => {
    expect(
      serializeCookie('pickup_session', 'a/b', { path: '/pickup', maxAge: 60, secure: true }),
    ).toBe('pickup_session=a%2Fb; Path=/pickup; Max-Age=60; HttpOnly; SameSite=Strict; Secure');
  });

  it('leaves out Secure for a plain http deployment', () => {
    expect(serializeCookie('s', 'v', { path: '/', maxAge: 0, secure: false })).toBe(
      's=v; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
    );
  });
});
