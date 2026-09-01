import type { ValorantError } from '../valorant/http.ts';
import type { Strings } from './strings.ts';

/**
 * Turns a client failure into something a member can act on. The `http` and
 * `invalid-response` cases collapse into one message on purpose: neither tells
 * the member anything they could do differently, and the detail is in the log.
 */
export const describeValorantError = (error: ValorantError, strings: Strings): string => {
  switch (error.kind) {
    case 'not-configured':
      return strings.valorantNotConfigured;
    case 'unauthorized':
      return strings.valorantUnauthorized;
    case 'rate-limited':
      return strings.valorantRateLimited;
    default:
      return strings.valorantApiUnavailable;
  }
};
