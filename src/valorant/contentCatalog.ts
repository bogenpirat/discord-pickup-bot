import {
  buildContentIndex,
  type ContentBucket,
  type ContentEntity,
  type ContentIndex,
  type ContentInput,
  EMPTY_CONTENT_INDEX,
} from '../domain/valorant/content.ts';
import type { Logger } from '../logger.ts';
import type { ValorantClient } from './client.ts';

/**
 * The dump is localised, and one request answers for one locale only: the same
 * card id is `Dayglo Duo Card` in `en-US` and `Banner „Dayglo-Duo“` in `de-DE`.
 * The bot is German first (see `DEFAULT_LOCALE`), so it reads German and every
 * name it resolves is German — supporting a second language means fetching a
 * second dump and keying the index by locale, not translating this one.
 */
const CONTENT_LOCALE = 'de-DE';

/**
 * The content dump, held for the life of the process.
 *
 * A catalog exists whether or not the API is configured; before `load` succeeds
 * — and forever, if there is no API key — every lookup answers null, which each
 * call site already has to handle for ids the dump does not know.
 */
export interface ContentCatalog {
  find(reference: string | null | undefined): ContentEntity | null;
  findIn(bucket: ContentBucket, reference: string | null | undefined): ContentEntity | null;
  ceremony(code: string | null | undefined): ContentEntity | null;
  seasonLabel(reference: string | null | undefined): string | null;
  namesIn(payload: unknown): ReadonlyMap<string, string>;
  /**
   * Reads the dump and swaps it in. Never throws and never rejects: the bot is
   * expected to run without it, so a failure is logged and answered with false.
   */
  load(): Promise<boolean>;
}

export interface ContentCatalogDeps {
  /** Null when no API key is configured, which leaves the catalog permanently empty. */
  readonly client: ValorantClient | null;
  readonly logger: Logger;
  readonly locale?: string | undefined;
}

export const createContentCatalog = (deps: ContentCatalogDeps): ContentCatalog => {
  const locale = deps.locale ?? CONTENT_LOCALE;
  let index: ContentIndex = EMPTY_CONTENT_INDEX;

  return {
    find: (reference) => index.find(reference),
    findIn: (bucket, reference) => index.findIn(bucket, reference),
    ceremony: (code) => index.ceremony(code),
    seasonLabel: (reference) => index.seasonLabel(reference),
    namesIn: (payload) => index.namesIn(payload),

    load: async () => {
      const client = deps.client;
      if (client === null) {
        return false;
      }

      const result = await client.getContent({ locale });

      if (!result.ok) {
        // Nothing else fails with it: the commands that would have used a name
        // fall back to the id, or to the short code the API sent alongside it.
        deps.logger.warn({ err: result.error, locale }, 'valorant content dump unavailable');
        return false;
      }

      index = buildContentIndex(result.value as ContentInput);
      deps.logger.info(
        { locale, version: index.version, entities: index.size },
        'valorant content dump loaded',
      );
      return true;
    },
  };
};
