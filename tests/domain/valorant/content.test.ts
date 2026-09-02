import { describe, expect, it } from 'vitest';
import {
  buildContentIndex,
  type ContentInput,
  EMPTY_CONTENT_INDEX,
} from '../../../src/domain/valorant/content.ts';
import { SAMPLE_CONTENT } from '../../helpers/valorant.ts';

const index = buildContentIndex(SAMPLE_CONTENT);

const VANDAL = '9c82e19d-4575-0200-1a81-3eacf00cf872';
const ASCENT = '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319';
const CARD = 'e9a3d874-4893-b17a-00ca-0b88017f7919';
const ACT_ONE = '67e373c7-48f7-b422-641b-079ace30b427';
const EPISODE_FIVE = 'fcf2c8f4-4324-e50b-2e23-718e4a3ab046';

describe('looking an id up', () => {
  it('names an entity from any bucket, without being told which', () => {
    expect(index.find(VANDAL)?.name).toBe('Vandal');
    expect(index.find(CARD)?.name).toBe('Banner „Neo Frontier“');
    expect(index.find(VANDAL)?.bucket).toBe('equips');
  });

  it('reads the version and counts what it indexed', () => {
    expect(index.version).toBe('release-13.05');
    expect(index.size).toBe(9);
  });

  it('ignores case, since the raw endpoints are not consistent about it', () => {
    expect(index.find(VANDAL.toUpperCase())?.name).toBe('Vandal');
  });

  it('answers nothing for an unknown id, or for no id at all', () => {
    expect(index.find('11d52dba-a1b8-4d76-811e-78639b72a1d9')).toBeNull();
    expect(index.find(null)).toBeNull();
    expect(index.find(undefined)).toBeNull();
    expect(index.find('')).toBeNull();
  });

  it('answers nothing when the id is not from the bucket the field promises', () => {
    expect(index.findIn('playerCards', CARD)?.name).toBe('Banner „Neo Frontier“');
    // A weapon id where a card belongs is a bug, not a card named Vandal.
    expect(index.findIn('playerCards', VANDAL)).toBeNull();
  });

  it('resolves the asset paths the raw endpoints use in place of ids', () => {
    expect(index.find('/Game/Maps/Ascent/Ascent')?.name).toBe('Ascent');
    expect(index.find('/Game/GameModes/Bomb/BombGameMode.BombGameMode_C')?.name).toBe('Standard');
    expect(index.find(ASCENT)?.name).toBe('Ascent');
  });
});

describe('naming a season', () => {
  it('prefixes the act with its episode, which is what makes it unambiguous', () => {
    expect(index.seasonLabel(ACT_ONE)).toBe('EPISODE 5 · AKT I');
  });

  it('names an episode on its own, having no parent to prefix it with', () => {
    expect(index.seasonLabel(EPISODE_FIVE)).toBe('EPISODE 5');
  });

  it('answers nothing for an id that is not an act', () => {
    expect(index.seasonLabel(ASCENT)).toBeNull();
    expect(index.seasonLabel(null)).toBeNull();
  });
});

describe('naming a ceremony', () => {
  it('resolves the code a round reports to the ceremony behind it', () => {
    expect(index.ceremony('CeremonyFlawless')?.name).toBe('MAKELLOS');
  });

  it('takes the bare form too', () => {
    expect(index.ceremony('Flawless')?.name).toBe('MAKELLOS');
  });

  it('answers nothing for a round that had no ceremony', () => {
    expect(index.ceremony('CeremonyDefault')).toBeNull();
    expect(index.ceremony('')).toBeNull();
    expect(index.ceremony(null)).toBeNull();
  });
});

describe('naming everything in a payload', () => {
  it('finds ids at any depth, including inside arrays', () => {
    const payload = {
      metadata: { map: { id: ASCENT }, season: { id: ACT_ONE } },
      players: [{ customization: { card: CARD } }, { customization: { card: CARD } }],
      rounds: [{ stats: [{ economy: { weapon: { id: VANDAL } } }] }],
    };

    expect(Object.fromEntries(index.namesIn(payload))).toEqual({
      [ASCENT]: 'Ascent',
      [ACT_ONE]: 'AKT I',
      [CARD]: 'Banner „Neo Frontier“',
      [VANDAL]: 'Vandal',
    });
  });

  it('leaves the ids it cannot name out rather than guessing', () => {
    const payload = { puuid: '05798cdc-0df9-544f-8732-831a1ab129c7', name: 'Sage', tag: 'EUW' };

    // 'Sage' is a character's *name*, and naming it back would be nonsense.
    expect(index.namesIn(payload).size).toBe(0);
  });

  it('walks an answer that is a bare array, or nothing at all', () => {
    expect(Object.fromEntries(index.namesIn([{ map: { id: ASCENT } }]))).toEqual({
      [ASCENT]: 'Ascent',
    });
    expect(index.namesIn(null).size).toBe(0);
    expect(index.namesIn(undefined).size).toBe(0);
  });
});

describe('a dump that is not one', () => {
  it('indexes nothing at all, and answers every lookup with null', () => {
    expect(EMPTY_CONTENT_INDEX.size).toBe(0);
    expect(EMPTY_CONTENT_INDEX.version).toBeNull();
    expect(EMPTY_CONTENT_INDEX.find(VANDAL)).toBeNull();
    expect(EMPTY_CONTENT_INDEX.seasonLabel(ACT_ONE)).toBeNull();
    expect(EMPTY_CONTENT_INDEX.namesIn({ map: { id: ASCENT } }).size).toBe(0);
  });

  it('skips buckets it does not know and entries missing an id or a name', () => {
    const content: ContentInput = {
      // A bucket Riot might add: indexed by nobody, so nobody can rely on it.
      levelBorders: [{ id: '49413ac2-4ed5-6953-5791-db838ccb58f3', name: 'Level 100' }],
      equips: [
        { id: VANDAL, name: 'Vandal' },
        { id: null, name: 'Nameless' },
        { id: '2f59173c-4bed-b6c3-2191-dea9b58be9c7', name: '' },
      ],
      version: null,
    };
    const sparse = buildContentIndex(content);

    expect(sparse.size).toBe(1);
    expect(sparse.find('49413ac2-4ed5-6953-5791-db838ccb58f3')).toBeNull();
    expect(sparse.find('2f59173c-4bed-b6c3-2191-dea9b58be9c7')).toBeNull();
    expect(sparse.version).toBeNull();
  });

  it('falls back to a ceremony’s own name when its asset is not the usual shape', () => {
    const sparse = buildContentIndex({
      ceremonies: [
        { id: 'a6100421-4ecb-bd55-7c23-e4899643f230', name: 'CLUTCH' },
        { id: '1e71c55c-476e-24ac-0687-e48b547dbb35', name: 'ASS', assetName: 'Renamed_Asset' },
      ],
    });

    expect(sparse.ceremony('CeremonyClutch')?.name).toBe('CLUTCH');
    expect(sparse.ceremony('CeremonyAss')?.name).toBe('ASS');
  });

  it('keeps the first entry when an id turns up in two buckets', () => {
    const sparse = buildContentIndex({
      equips: [{ id: VANDAL, name: 'Vandal' }],
      maps: [{ id: VANDAL, name: 'Somehow Also A Map' }],
    });

    expect(sparse.find(VANDAL)?.bucket).toBe('equips');
    expect(sparse.size).toBe(2);
  });
});
