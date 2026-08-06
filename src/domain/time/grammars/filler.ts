/**
 * Words that only lead into a time and carry no meaning of their own. They are
 * stripped from the front of an expression so "gegen 21 uhr" and "sonntag um
 * 20 uhr" reach the grammars as the time they describe.
 */
const LEADING_FILLER = /^(?:(?:um|ab|gegen|at|around)\s+|@\s*)/;

export const stripLeadingFiller = (input: string): string => input.replace(LEADING_FILLER, '');
