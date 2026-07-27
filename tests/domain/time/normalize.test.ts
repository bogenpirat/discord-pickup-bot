import { describe, expect, it } from 'vitest';
import { normalize } from '../../../src/domain/time/normalize.ts';

describe('normalize', () => {
  it.each([
    ['  20:30  ', '20:30'],
    ['20 UHR', '20'],
    ['20:30 Uhr', '20:30'],
    ['HALB 9', 'halb 9'],
    ['Viertel   Vor   9', 'viertel vor 9'],
    ['in 1,5 Stunden', 'in 1.5 stunden'],
    ['übermorgen', 'uebermorgen'],
    ['MÖRGEN', 'moergen'],
    ['spaß', 'spass'],
    ['in 90 Minuten', 'in 90 minuten'],
    ['', ''],
    ['   ', ''],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('leaves a comma that is not between digits alone', () => {
    expect(normalize('20:30, danach')).toBe('20:30, danach');
  });

  it('only strips a trailing uhr', () => {
    expect(normalize('uhrzeit 20:30')).toBe('uhrzeit 20:30');
  });
});
