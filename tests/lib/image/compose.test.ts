import { describe, expect, it } from 'vitest';
import { fitWithin, flatten, resize, stackVertically } from '../../../src/lib/image/compose.ts';
import type { Raster } from '../../../src/lib/image/decode.ts';
import { pixelAt, solidRaster } from '../../helpers/images.ts';

const BLACK = { r: 0, g: 0, b: 0 };
const GREY = { r: 100, g: 100, b: 100 };

/** A raster whose left half is one colour and right half another. */
const split = (width: number, height: number): Raster => {
  const raster = solidRaster(width, height, [0, 0, 0, 255]);
  for (let y = 0; y < height; y += 1) {
    for (let x = width / 2; x < width; x += 1) {
      raster.data.set([255, 255, 255, 255], (y * width + x) * 4);
    }
  }
  return raster;
};

describe('flatten', () => {
  it('composites over the background and makes every pixel opaque', () => {
    expect(pixelAt(flatten(solidRaster(1, 1, [200, 0, 0, 0]), GREY), 0, 0)).toEqual([
      100, 100, 100, 255,
    ]);
    expect(pixelAt(flatten(solidRaster(1, 1, [200, 0, 0, 255]), GREY), 0, 0)).toEqual([
      200, 0, 0, 255,
    ]);
    expect(pixelAt(flatten(solidRaster(1, 1, [200, 0, 0, 51]), GREY), 0, 0)).toEqual([
      120, 80, 80, 255,
    ]);
  });
});

describe('resize', () => {
  it('returns the raster untouched when the size already matches', () => {
    const raster = solidRaster(4, 4, [1, 2, 3, 255]);
    expect(resize(raster, 4, 4)).toBe(raster);
  });

  it.each([
    ['a large reduction', 64, 32, 5, 3],
    ['a small reduction', 10, 10, 7, 7],
    ['an enlargement', 3, 2, 12, 8],
    ['odd dimensions', 9, 7, 2, 1],
  ])('handles %s and keeps a flat colour flat', (_label, w, h, toW, toH) => {
    const out = resize(solidRaster(w, h, [10, 200, 30, 255]), toW, toH);
    expect(out).toMatchObject({ width: toW, height: toH });
    expect(out.data.length).toBe(toW * toH * 4);
    expect(pixelAt(out, toW - 1, toH - 1)).toEqual([10, 200, 30, 255]);
  });

  it('keeps a hard edge where it was', () => {
    const out = resize(split(16, 4), 4, 1);
    expect(pixelAt(out, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(out, 3, 0)).toEqual([255, 255, 255, 255]);
  });
});

describe('fitWithin', () => {
  it('scales a wide strip to the box width', () => {
    expect(fitWithin(solidRaster(1024, 256, [0, 0, 0, 255]), 1200, 600)).toMatchObject({
      width: 1200,
      height: 300,
    });
  });

  it('scales a tall image to the box height', () => {
    expect(fitWithin(solidRaster(100, 100, [0, 0, 0, 255]), 1200, 600)).toMatchObject({
      width: 600,
      height: 600,
    });
  });
});

describe('stackVertically', () => {
  it('stacks top to bottom and centres a narrower raster on the background', () => {
    const top = solidRaster(4, 2, [255, 0, 0, 255]);
    const bottom = solidRaster(2, 1, [0, 0, 255, 255]);
    const out = stackVertically([top, bottom], BLACK);

    expect(out).toMatchObject({ width: 4, height: 3 });
    expect(pixelAt(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(out, 3, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(out, 0, 2)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(out, 1, 2)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(out, 2, 2)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(out, 3, 2)).toEqual([0, 0, 0, 255]);
  });
});
