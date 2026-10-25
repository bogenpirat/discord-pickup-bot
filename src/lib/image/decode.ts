import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/** Raw pixels, four bytes per pixel in RGBA order, rows top to bottom. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** The formats Discord shows inline, which is all a passed-through file needs to be. */
export type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp';

/**
 * Banners seen in the wild top out around 2500×800, about 2 megapixels. The cap
 * leaves plenty of room above that while keeping a hostile file from making the
 * decoder allocate gigabytes.
 */
const MAX_PIXELS = 16_000_000;
const MAX_JPEG_MEMORY_MB = 256;

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + prefix.length &&
  prefix.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/** Identifies a file by its magic bytes; the extension and content type are not trusted. */
export const sniffFormat = (bytes: Uint8Array): ImageFormat | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (startsWith(bytes, ascii('GIF8'))) {
    return 'gif';
  }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return 'webp';
  }
  return null;
};

const decodeJpeg = (bytes: Uint8Array): Raster =>
  jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    maxResolutionInMP: MAX_PIXELS / 1_000_000,
    maxMemoryUsageInMB: MAX_JPEG_MEMORY_MB,
  });

/** The IHDR dimensions, read before decoding so an oversized PNG is refused unread. */
const pngPixelCount = (bytes: Uint8Array): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return bytes.length < 24 ? 0 : view.getUint32(16) * view.getUint32(20);
};

const decodePng = (bytes: Uint8Array): Raster | null => {
  if (pngPixelCount(bytes) > MAX_PIXELS) {
    return null;
  }
  const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return { width: png.width, height: png.height, data: png.data };
};

/**
 * Decodes a JPEG or PNG into RGBA pixels. Anything else, and anything either
 * decoder chokes on, comes back as null: a picture is decoration here, never a
 * reason to fail the reply it would have decorated.
 */
export const decodeImage = (bytes: Uint8Array): Raster | null => {
  try {
    switch (sniffFormat(bytes)) {
      case 'jpeg':
        return decodeJpeg(bytes);
      case 'png':
        return decodePng(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
};

export const encodeJpeg = (raster: Raster, quality: number): Buffer =>
  jpeg.encode(raster, quality).data;
