import type { Raster } from '../../src/lib/image/decode.ts';
import { encodeJpeg } from '../../src/lib/image/decode.ts';
import { encodePng } from '../../src/lib/image/png.ts';

/** A raster of one colour throughout. */
export const solidRaster = (width: number, height: number, rgba: readonly number[]): Raster => {
  const data = new Uint8Array(width * height * 4);
  for (let at = 0; at < data.length; at += 4) {
    data.set(rgba, at);
  }
  return { width, height, data };
};

/** The colour at a pixel, as `[r, g, b, a]`. */
export const pixelAt = (raster: Raster, x: number, y: number): number[] => {
  const at = (y * raster.width + x) * 4;
  return [...raster.data.subarray(at, at + 4)];
};

export const solidPng = (width: number, height: number, rgba: readonly number[]): Buffer =>
  encodePng(width, height, solidRaster(width, height, rgba).data);

export const solidJpeg = (width: number, height: number, rgb: readonly number[]): Buffer =>
  encodeJpeg(solidRaster(width, height, [...rgb, 255]), 95);

export const ascii = (text: string): Buffer => Buffer.from(text, 'ascii');
