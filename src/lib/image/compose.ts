import type { Rgba } from './canvas.ts';
import type { Raster } from './decode.ts';

const BYTES_PER_PIXEL = 4;

type Rgb = Pick<Rgba, 'r' | 'g' | 'b'>;

/** Every index read here is in bounds; the fallback only satisfies the type checker. */
const byteAt = (data: Uint8Array, index: number): number => data[index] ?? 0;

const filled = (width: number, height: number, colour: Rgb): Raster => {
  const data = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let at = 0; at < data.length; at += BYTES_PER_PIXEL) {
    data[at] = colour.r;
    data[at + 1] = colour.g;
    data[at + 2] = colour.b;
    data[at + 3] = 255;
  }
  return { width, height, data };
};

/**
 * Composites the raster over a solid background so every pixel is opaque.
 * Done before any resampling: averaging a transparent pixel's colour into its
 * neighbours would otherwise bleed whatever the transparent area happened to
 * hold into the visible edge.
 */
export const flatten = (raster: Raster, background: Rgb): Raster => {
  const data = new Uint8Array(raster.data.length);
  for (let at = 0; at < data.length; at += BYTES_PER_PIXEL) {
    const alpha = byteAt(raster.data, at + 3) / 255;
    const inverse = 1 - alpha;
    data[at] = Math.round(byteAt(raster.data, at) * alpha + background.r * inverse);
    data[at + 1] = Math.round(byteAt(raster.data, at + 1) * alpha + background.g * inverse);
    data[at + 2] = Math.round(byteAt(raster.data, at + 2) * alpha + background.b * inverse);
    data[at + 3] = 255;
  }
  return { width: raster.width, height: raster.height, data };
};

/** Averages each 2×2 block into one pixel; an odd last row or column is folded into its neighbour. */
const halve = (raster: Raster): Raster => {
  const width = Math.max(1, Math.floor(raster.width / 2));
  const height = Math.max(1, Math.floor(raster.height / 2));
  const data = new Uint8Array(width * height * BYTES_PER_PIXEL);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.min(raster.height - 1, y * 2);
    const y1 = Math.min(raster.height - 1, y * 2 + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.min(raster.width - 1, x * 2);
      const x1 = Math.min(raster.width - 1, x * 2 + 1);
      const corners = [
        (y0 * raster.width + x0) * BYTES_PER_PIXEL,
        (y0 * raster.width + x1) * BYTES_PER_PIXEL,
        (y1 * raster.width + x0) * BYTES_PER_PIXEL,
        (y1 * raster.width + x1) * BYTES_PER_PIXEL,
      ];
      const at = (y * width + x) * BYTES_PER_PIXEL;
      for (let channel = 0; channel < BYTES_PER_PIXEL; channel += 1) {
        let sum = 0;
        for (const corner of corners) {
          sum += byteAt(raster.data, corner + channel);
        }
        data[at + channel] = Math.round(sum / corners.length);
      }
    }
  }

  return { width, height, data };
};

const bilinear = (raster: Raster, width: number, height: number): Raster => {
  const data = new Uint8Array(width * height * BYTES_PER_PIXEL);
  const scaleX = raster.width / width;
  const scaleY = raster.height / height;

  for (let y = 0; y < height; y += 1) {
    // Pixel centres, so an exact 1:1 copy samples each source pixel squarely.
    const sy = Math.min(raster.height - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(raster.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(raster.width - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(raster.width - 1, x0 + 1);
      const fx = sx - x0;
      const at = (y * width + x) * BYTES_PER_PIXEL;
      for (let channel = 0; channel < BYTES_PER_PIXEL; channel += 1) {
        const sample = (px: number, py: number): number =>
          byteAt(raster.data, (py * raster.width + px) * BYTES_PER_PIXEL + channel);
        const top = sample(x0, y0) * (1 - fx) + sample(x1, y0) * fx;
        const bottom = sample(x0, y1) * (1 - fx) + sample(x1, y1) * fx;
        data[at + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }

  return { width, height, data };
};

/**
 * Resamples to exactly `width`×`height`. Large reductions are first halved
 * with a box filter, since bilinear alone only ever looks at four source pixels
 * and would skip most of them, shimmering fine detail such as text.
 */
export const resize = (raster: Raster, width: number, height: number): Raster => {
  let current = raster;
  while (current.width >= width * 2 && current.height >= height * 2) {
    current = halve(current);
  }
  return current.width === width && current.height === height
    ? current
    : bilinear(current, width, height);
};

/** Scales to fit inside the box, keeping the aspect ratio. */
export const fitWithin = (raster: Raster, maxWidth: number, maxHeight: number): Raster => {
  const scale = Math.min(maxWidth / raster.width, maxHeight / raster.height);
  return resize(
    raster,
    Math.max(1, Math.round(raster.width * scale)),
    Math.max(1, Math.round(raster.height * scale)),
  );
};

/**
 * Stacks the rasters top to bottom on a canvas as wide as the widest of them,
 * centring any narrower one on the background.
 */
export const stackVertically = (rasters: readonly Raster[], background: Rgb): Raster => {
  const width = Math.max(...rasters.map((raster) => raster.width));
  const height = rasters.reduce((sum, raster) => sum + raster.height, 0);
  const canvas = filled(width, height, background);

  let top = 0;
  for (const raster of rasters) {
    const left = Math.floor((width - raster.width) / 2);
    const stride = raster.width * BYTES_PER_PIXEL;
    for (let y = 0; y < raster.height; y += 1) {
      canvas.data.set(
        raster.data.subarray(y * stride, (y + 1) * stride),
        ((top + y) * width + left) * BYTES_PER_PIXEL,
      );
    }
    top += raster.height;
  }

  return canvas;
};
