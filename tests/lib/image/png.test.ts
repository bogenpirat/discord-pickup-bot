import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng } from '../../../src/lib/image/png.ts';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Walks the chunk list the way a decoder would, so structure errors surface. */
const chunksOf = (png: Buffer): { type: string; data: Buffer }[] => {
  const chunks: { type: string; data: Buffer }[] = [];
  let at = SIGNATURE.length;

  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    const declared = png.readUInt32BE(at + 8 + length);

    expect(declared, `crc of ${type}`).toBe(crc32(png.subarray(at + 4, at + 8 + length)));
    chunks.push({ type, data });
    at += 12 + length;
  }

  return chunks;
};

const solid = (width: number, height: number, rgba: readonly number[]): Uint8Array => {
  const pixels = new Uint8Array(width * height * 4);
  for (let at = 0; at < pixels.length; at += 4) {
    pixels.set(rgba, at);
  }
  return pixels;
};

describe('crc32', () => {
  // The check value every CRC-32 implementation is measured against.
  it('produces the standard check value for "123456789"', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
  });

  it('is zero for no input', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('encodePng', () => {
  it('starts with the png signature', () => {
    const png = encodePng(2, 2, solid(2, 2, [255, 0, 0, 255]));
    expect(png.subarray(0, 8).equals(SIGNATURE)).toBe(true);
  });

  it('writes exactly IHDR, IDAT and IEND, each with a valid crc', () => {
    const chunks = chunksOf(encodePng(4, 3, solid(4, 3, [1, 2, 3, 4])));
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('describes the image in the header', () => {
    const [header] = chunksOf(encodePng(7, 5, solid(7, 5, [0, 0, 0, 255])));
    const data = header?.data as Buffer;

    expect(data.readUInt32BE(0)).toBe(7);
    expect(data.readUInt32BE(4)).toBe(5);
    expect(data.readUInt8(8)).toBe(8); // bit depth
    expect(data.readUInt8(9)).toBe(6); // truecolour with alpha
    expect(data.readUInt8(10)).toBe(0);
    expect(data.readUInt8(11)).toBe(0);
    expect(data.readUInt8(12)).toBe(0); // not interlaced
  });

  it('round-trips the pixels through the compressed data', () => {
    const width = 3;
    const height = 2;
    const pixels = new Uint8Array(width * height * 4);
    for (let at = 0; at < pixels.length; at += 1) {
      pixels[at] = at * 3;
    }

    const [, idat] = chunksOf(encodePng(width, height, pixels));
    const raw = inflateSync(idat?.data as Buffer);
    const stride = width * 4;

    expect(raw.length).toBe(height * (stride + 1));
    for (let y = 0; y < height; y += 1) {
      expect(raw[y * (stride + 1)], `filter byte of row ${y}`).toBe(0);
      expect([...raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))]).toEqual([
        ...pixels.subarray(y * stride, (y + 1) * stride),
      ]);
    }
  });

  it('ends with an empty IEND', () => {
    const chunks = chunksOf(encodePng(1, 1, solid(1, 1, [0, 0, 0, 0])));
    expect(chunks.at(-1)).toEqual({ type: 'IEND', data: Buffer.alloc(0) });
  });

  it.each([
    [0, 1],
    [1, 0],
    [-1, 4],
  ])('refuses a %ix%i image', (width, height) => {
    expect(() => encodePng(width, height, new Uint8Array())).toThrow(/positive width and height/);
  });

  it('refuses a pixel buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(/expected 16 bytes of rgba, got 15/);
  });
});
