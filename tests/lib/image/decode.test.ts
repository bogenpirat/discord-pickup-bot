import { describe, expect, it } from 'vitest';
import { decodeImage, encodeJpeg, sniffFormat } from '../../../src/lib/image/decode.ts';
import { ascii, pixelAt, solidJpeg, solidPng, solidRaster } from '../../helpers/images.ts';

const webp = Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WEBPVP8 ')]);

describe('sniffFormat', () => {
  it.each([
    ['jpeg', solidJpeg(2, 2, [1, 2, 3])],
    ['png', solidPng(2, 2, [1, 2, 3, 255])],
    ['gif', ascii('GIF89a......')],
    ['webp', webp],
  ])('recognises %s by its magic bytes', (format, bytes) => {
    expect(sniffFormat(bytes)).toBe(format);
  });

  it.each([
    ['html', ascii('<!doctype html>')],
    ['a RIFF that is not webp', Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WAVE')])],
    ['nothing', Buffer.alloc(0)],
  ])('refuses %s', (_label, bytes) => {
    expect(sniffFormat(bytes)).toBeNull();
  });
});

describe('decodeImage', () => {
  it('decodes a png to rgba', () => {
    const raster = decodeImage(solidPng(3, 2, [10, 20, 30, 128]));
    expect(raster).toMatchObject({ width: 3, height: 2 });
    expect(raster && pixelAt(raster, 2, 1)).toEqual([10, 20, 30, 128]);
  });

  it('decodes a jpeg to opaque rgba', () => {
    const raster = decodeImage(solidJpeg(4, 4, [200, 100, 50]));
    expect(raster).toMatchObject({ width: 4, height: 4 });
    const [r, g, b, a] = raster ? pixelAt(raster, 1, 1) : [];
    // Lossy, so only close to what went in.
    expect(Math.abs((r ?? 0) - 200)).toBeLessThan(6);
    expect(Math.abs((g ?? 0) - 100)).toBeLessThan(6);
    expect(Math.abs((b ?? 0) - 50)).toBeLessThan(6);
    expect(a).toBe(255);
  });

  it('refuses a png whose header claims more pixels than the cap, without decoding it', () => {
    const png = solidPng(1, 1, [0, 0, 0, 255]);
    png.writeUInt32BE(5_000, 16);
    png.writeUInt32BE(5_000, 20);
    expect(decodeImage(png)).toBeNull();
  });

  it.each([
    ['a truncated jpeg', solidJpeg(8, 8, [1, 2, 3]).subarray(0, 40)],
    ['a truncated png', solidPng(8, 8, [1, 2, 3, 255]).subarray(0, 40)],
    ['a png too short to have a header', solidPng(8, 8, [1, 2, 3, 255]).subarray(0, 12)],
    ['a gif', ascii('GIF89a......')],
    ['a webp', webp],
    ['garbage', ascii('not an image')],
  ])('returns null for %s', (_label, bytes) => {
    expect(decodeImage(bytes)).toBeNull();
  });
});

describe('encodeJpeg', () => {
  it('produces a jpeg that decodes back to the same size', () => {
    const bytes = encodeJpeg(solidRaster(5, 3, [0, 128, 255, 255]), 90);
    expect(sniffFormat(bytes)).toBe('jpeg');
    expect(decodeImage(bytes)).toMatchObject({ width: 5, height: 3 });
  });
});
