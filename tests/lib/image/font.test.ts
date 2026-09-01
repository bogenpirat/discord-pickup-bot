import { describe, expect, it } from 'vitest';
import { type Canvas, createCanvas } from '../../../src/lib/image/canvas.ts';
import {
  drawText,
  GLYPH_HEIGHT,
  GLYPH_SPACING,
  GLYPH_WIDTH,
  textHeight,
  textWidth,
} from '../../../src/lib/image/font.ts';

const painted = (canvas: Canvas): number => {
  let count = 0;
  for (let at = 3; at < canvas.pixels.length; at += 4) {
    if ((canvas.pixels[at] ?? 0) > 0) {
      count += 1;
    }
  }
  return count;
};

describe('text measurement', () => {
  it('is zero for an empty string', () => {
    expect(textWidth('')).toBe(0);
  });

  it('counts one glyph without trailing spacing', () => {
    expect(textWidth('A')).toBe(GLYPH_WIDTH);
  });

  it('adds spacing between glyphs only', () => {
    expect(textWidth('AB')).toBe(GLYPH_WIDTH * 2 + GLYPH_SPACING);
  });

  it('scales with the glyph size', () => {
    expect(textWidth('ABC', 2)).toBe(textWidth('ABC') * 2);
    expect(textHeight(3)).toBe(GLYPH_HEIGHT * 3);
  });
});

describe('drawText', () => {
  it('paints something for a visible glyph', () => {
    const canvas = createCanvas(20, 10);
    drawText(canvas, 'A', 0, 0, '#ffffff');

    expect(painted(canvas)).toBeGreaterThan(0);
  });

  it('paints nothing for a space', () => {
    const canvas = createCanvas(20, 10);
    drawText(canvas, ' ', 0, 0, '#ffffff');

    expect(painted(canvas)).toBe(0);
  });

  it('falls back to blank for a glyph it does not have', () => {
    const canvas = createCanvas(20, 10);
    drawText(canvas, '☃', 0, 0, '#ffffff');

    expect(painted(canvas)).toBe(0);
  });

  it('renders lowercase as its uppercase glyph', () => {
    const lower = createCanvas(20, 10);
    drawText(lower, 'abc', 0, 0, '#ffffff');
    const upper = createCanvas(20, 10);
    drawText(upper, 'ABC', 0, 0, '#ffffff');

    expect([...lower.pixels]).toEqual([...upper.pixels]);
  });

  it('advances the cursor between glyphs', () => {
    const canvas = createCanvas(40, 10);
    drawText(canvas, 'II', 0, 0, '#ffffff');

    const alphaAt = (x: number, y: number) => canvas.pixels[(y * canvas.width + x) * 4 + 3] ?? 0;

    expect(alphaAt(0, 0)).toBe(255);
    expect(alphaAt(GLYPH_WIDTH + GLYPH_SPACING, 0)).toBe(255);
  });

  it('scales a glyph into a block of pixels', () => {
    const single = createCanvas(40, 20);
    drawText(single, 'X', 0, 0, '#ffffff');
    const doubled = createCanvas(40, 20);
    drawText(doubled, 'X', 0, 0, '#ffffff', 2);

    expect(painted(doubled)).toBe(painted(single) * 4);
  });

  it('clips text that runs off the canvas rather than throwing', () => {
    const canvas = createCanvas(10, 10);
    expect(() => drawText(canvas, 'LONG TEXT', 6, 6, '#ffffff')).not.toThrow();
  });

  // A missing glyph is silent: it falls back to a space, so the label just loses
  // a character. This catches that at the point the character set is decided.
  it.each([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-.:/%#·(),'])(
    'has a glyph for %o',
    (character) => {
      const canvas = createCanvas(12, 10);
      drawText(canvas, character, 0, 0, '#ffffff');

      expect(painted(canvas)).toBeGreaterThan(0);
    },
  );
});
