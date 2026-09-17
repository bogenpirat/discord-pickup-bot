/**
 * The `getContent` dump, turned into a lookup table.
 *
 * Large parts of the API answer with bare uuids — a player's card and title, the
 * act a peak rank was set in, the weapon behind a kill — and the only place those
 * are named is the content dump. The dump describes the *game build* rather than
 * any account, so it changes with a patch and not with a match, which is what
 * makes reading it once and keeping it around reasonable.
 *
 * Everything here is pure: the fetching, and the decision of when to refetch,
 * belong to `src/valorant/contentCatalog.ts`.
 */

/**
 * The buckets the dump answers with. Anything outside this list is ignored
 * rather than indexed, so a bucket Riot adds cannot quietly start answering
 * lookups under a name this code has never seen.
 */
export const CONTENT_BUCKETS = [
  'acts',
  'ceremonies',
  'characters',
  'charmLevels',
  'charms',
  'chromas',
  'equips',
  'gameModes',
  'maps',
  'playerCards',
  'playerTitles',
  'skinLevels',
  'skins',
  'sprayLevels',
  'sprays',
] as const;

export type ContentBucket = (typeof CONTENT_BUCKETS)[number];

/**
 * One entry of a bucket, named structurally so the domain does not depend on the
 * generated API types — which matters more than usual here, because the upstream
 * schema documents neither `assetPath` nor `parentId` although the API answers
 * with both.
 */
export interface ContentItemInput {
  readonly id?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly assetName?: string | null | undefined;
  /** The Unreal asset the entry stands for, which is how the raw endpoints name maps and modes. */
  readonly assetPath?: string | null | undefined;
  /** On an act, the episode it belongs to. */
  readonly parentId?: string | null | undefined;
}

/** The dump itself: a `version` string and one array per bucket. */
export type ContentInput = Readonly<Record<string, unknown>>;

export interface ContentEntity {
  readonly bucket: ContentBucket;
  readonly id: string;
  readonly name: string;
  /** The episode an act sits in, and null everywhere else. */
  readonly parentId: string | null;
}

export interface ContentIndex {
  /** The game build the dump describes, for example `release-13.05`. */
  readonly version: string | null;
  readonly size: number;
  /** The entity behind a uuid or an asset path, or null for anything unknown. */
  find(reference: string | null | undefined): ContentEntity | null;
  /**
   * The same, but only when the entity turns out to sit in the bucket the field
   * is documented to point at — so a mislabelled id is answered with nothing
   * rather than with a weapon's name in place of a player's card.
   */
  findIn(bucket: ContentBucket, reference: string | null | undefined): ContentEntity | null;
  /** The ceremony behind a round's `CeremonyFlawless`-style code. */
  ceremony(code: string | null | undefined): ContentEntity | null;
  /**
   * An act id as `EPISODE 5 · ACT I`. The act's own name is only ever `ACT I`,
   * which repeats once per episode, so the episode is part of the answer.
   */
  seasonLabel(reference: string | null | undefined): string | null;
  /** Every reference anywhere in a payload that this index can name. */
  namesIn(payload: unknown): ReadonlyMap<string, string>;
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** `Default__FlawlessCeremony_PrimaryAsset_C` — the part before `Ceremony` is the code. */
const CEREMONY_ASSET = /^Default__(.+)Ceremony_PrimaryAsset_C$/;

const CEREMONY_PREFIX = 'Ceremony';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a reference looks like, checked before a payload walk asks the index
 * about a string. Without it every name, tag and message in a response would be
 * a lookup, and any of them could collide with an entry by accident.
 */
const looksLikeReference = (value: string): boolean =>
  UUID.test(value) || value.startsWith('/Game/');

const isBucket = (value: string): value is ContentBucket =>
  (CONTENT_BUCKETS as readonly string[]).includes(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const entityFrom = (bucket: ContentBucket, item: ContentItemInput): ContentEntity | null => {
  const id = text(item.id);
  const name = text(item.name);

  if (id === null || name === null) {
    return null;
  }

  const parentId = text(item.parentId);
  return { bucket, id, name, parentId: parentId === ZERO_UUID ? null : parentId };
};

const ceremonyCodeOf = (item: ContentItemInput, entity: ContentEntity): string => {
  const asset = text(item.assetName);
  const matched = asset === null ? null : CEREMONY_ASSET.exec(asset);
  return (matched?.[1] ?? entity.name).toLowerCase();
};

/**
 * Indexes the dump by id, and by asset path for the raw endpoints, which name
 * maps and game modes with a path rather than a uuid.
 *
 * Ids are unique across the whole dump, so one table is enough and the bucket
 * never has to be known up front. The first entry wins if that ever stops being
 * true, which is arbitrary but at least does not depend on key order.
 */
export const buildContentIndex = (content: ContentInput): ContentIndex => {
  const byReference = new Map<string, ContentEntity>();
  const byCeremonyCode = new Map<string, ContentEntity>();
  let size = 0;

  const add = (reference: string, entity: ContentEntity): void => {
    const key = reference.toLowerCase();
    if (!byReference.has(key)) {
      byReference.set(key, entity);
    }
  };

  for (const [bucket, value] of Object.entries(content)) {
    if (!isBucket(bucket) || !Array.isArray(value)) {
      continue;
    }

    for (const item of value as readonly ContentItemInput[]) {
      const entity = entityFrom(bucket, item);
      if (entity === null) {
        continue;
      }

      size += 1;
      add(entity.id, entity);

      const assetPath = text(item.assetPath);
      if (assetPath !== null) {
        add(assetPath, entity);
      }

      if (bucket === 'ceremonies') {
        byCeremonyCode.set(ceremonyCodeOf(item, entity), entity);
      }
    }
  }

  const find = (reference: string | null | undefined): ContentEntity | null =>
    reference == null ? null : (byReference.get(reference.toLowerCase()) ?? null);

  const findIn = (bucket: ContentBucket, reference: string | null | undefined) => {
    const found = find(reference);
    return found?.bucket === bucket ? found : null;
  };

  const namesIn = (payload: unknown): ReadonlyMap<string, string> => {
    const names = new Map<string, string>();
    const pending: unknown[] = [payload];

    while (pending.length > 0) {
      const node = pending.pop();

      if (typeof node === 'string') {
        const found = looksLikeReference(node) ? find(node) : null;
        if (found !== null) {
          names.set(node, found.name);
        }
        continue;
      }

      // Parsed JSON, so this cannot cycle back on itself.
      if (typeof node === 'object' && node !== null) {
        pending.push(...Object.values(node));
      }
    }

    return names;
  };

  return {
    version: text(content['version']),
    size,
    find,
    findIn,

    ceremony: (code) => {
      const trimmed = code?.trim();
      if (trimmed === undefined || trimmed === '') {
        return null;
      }

      const key = (
        trimmed.startsWith(CEREMONY_PREFIX) ? trimmed.slice(CEREMONY_PREFIX.length) : trimmed
      ).toLowerCase();

      // `CeremonyDefault` is the absence of a ceremony and has no entry, which
      // is why an unknown code is answered with null rather than the raw code.
      return byCeremonyCode.get(key) ?? null;
    },

    seasonLabel: (reference) => {
      const act = findIn('acts', reference);
      if (act === null) {
        return null;
      }

      // An episode is an `acts` entry too, and has no parent to prefix it with.
      const episode = find(act.parentId);
      return episode === null ? act.name : `${episode.name} · ${act.name}`;
    },

    namesIn,
  };
};

/** What every lookup answers with until a dump has been read. */
export const EMPTY_CONTENT_INDEX: ContentIndex = buildContentIndex({});
