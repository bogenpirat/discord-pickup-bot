/** Reads a `Cookie` header into name/value pairs. The first of a repeated name wins. */
export const parseCookies = (header: string | undefined): ReadonlyMap<string, string> => {
  const cookies = new Map<string, string>();

  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    if (name === '' || cookies.has(name)) {
      continue;
    }
    try {
      cookies.set(name, decodeURIComponent(raw));
    } catch {
      // A malformed escape is somebody else's cookie, not ours to fail on.
    }
  }

  return cookies;
};

export interface CookieOptions {
  readonly path: string;
  /** Seconds; zero expires the cookie immediately. */
  readonly maxAge: number;
  readonly secure: boolean;
}

/**
 * Builds a `Set-Cookie` value. Always HttpOnly and SameSite=Strict: the cookie
 * is a login, so page scripts never need it and no other site may send it.
 */
export const serializeCookie = (name: string, value: string, options: CookieOptions): string =>
  [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
