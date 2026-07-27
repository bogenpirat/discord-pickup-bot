const UMLAUTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

export const normalize = (input: string): string => {
  let value = input.trim().toLowerCase();

  for (const [pattern, replacement] of UMLAUTS) {
    value = value.replace(pattern, replacement);
  }

  value = value.replace(/(\d),(\d)/g, '$1.$2');
  value = value.replace(/\s+/g, ' ');
  value = value.replace(/\s*uhr$/, '');

  return value.trim();
};
