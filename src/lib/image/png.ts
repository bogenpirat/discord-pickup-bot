import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Truecolour with alpha; the only colour type this encoder emits. */
const COLOUR_TYPE_RGBA = 6;
const BIT_DEPTH = 8;
const BYTES_PER_PIXEL = 4;

/**
 * The CRC-32 every PNG chunk carries, over its type and data.
 *
 * Computed a bit at a time rather than through the usual 256-entry table: a
 * chart is a few kilobytes, so the table would save microseconds while costing
 * an index lookup this codebase would have to null-check.
 */
export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));

  return Buffer.concat([length, typed, crc]);
};

const ihdr = (width: number, height: number): Buffer => {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(BIT_DEPTH, 8);
  data.writeUInt8(COLOUR_TYPE_RGBA, 9);
  data.writeUInt8(0, 10); // deflate, the only defined compression method
  data.writeUInt8(0, 11); // adaptive filtering, the only defined filter method
  data.writeUInt8(0, 12); // no interlacing
  return data;
};

/**
 * Encodes raw RGBA pixels as a PNG.
 *
 * Every scanline is prefixed with filter type 0 (none). The filters exist to make
 * the image compress better, and for a flat-coloured chart on a flat background
 * deflate already finds the runs; picking filters per line would cost code and
 * buy a few kilobytes on an image that is well under Discord's limit either way.
 */
export const encodePng = (width: number, height: number, rgba: Uint8Array): Buffer => {
  const expected = width * height * BYTES_PER_PIXEL;
  if (width <= 0 || height <= 0) {
    throw new Error('png needs a positive width and height');
  }
  if (rgba.length !== expected) {
    throw new Error(`png expected ${expected} bytes of rgba, got ${rgba.length}`);
  }

  const stride = width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr(width, height)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
