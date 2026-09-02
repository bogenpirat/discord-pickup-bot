import { encodePng } from './png.ts';

/** `#rrggbb` or `#rrggbbaa`. */
export type Colour = string;

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export const parseColour = (colour: Colour): Rgba => {
  const hex = colour.startsWith('#') ? colour.slice(1) : colour;
  if (hex.length !== 6 && hex.length !== 8) {
    throw new Error(`unsupported colour ${colour}`);
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
  };
};

export interface Canvas {
  readonly width: number;
  readonly height: number;
  /** Source-over blend of one pixel. Out-of-bounds coordinates are dropped. */
  set(x: number, y: number, colour: Rgba): void;
  fill(colour: Colour): void;
  rect(x: number, y: number, width: number, height: number, colour: Colour): void;
  /** A one-pixel-wide line, thickened symmetrically when `weight` is above 1. */
  line(x0: number, y0: number, x1: number, y1: number, colour: Colour, weight?: number): void;
  /** A horizontal run of `on` pixels every `on + off`, for gridlines. */
  dashedRow(y: number, x0: number, x1: number, colour: Colour, on?: number, off?: number): void;
  /**
   * `line`, broken into `on` pixels every `on + off` along its length. Reads as
   * "the path between these two points is not measured", where a solid line
   * would claim it was.
   */
  dashedLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    colour: Colour,
    weight?: number,
    on?: number,
    off?: number,
  ): void;
  disc(cx: number, cy: number, radius: number, colour: Colour): void;
  /** An upward triangle when `up`, a downward one otherwise. */
  triangle(cx: number, cy: number, radius: number, up: boolean, colour: Colour): void;
  toPng(): Buffer;
  /** Raw RGBA, exposed so tests can assert on what was drawn. */
  readonly pixels: Uint8Array;
}

export const createCanvas = (width: number, height: number): Canvas => {
  const pixels = new Uint8Array(width * height * 4);

  const set = (x: number, y: number, colour: Rgba): void => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) {
      return;
    }

    const at = (py * width + px) * 4;
    if (colour.a >= 255) {
      pixels[at] = colour.r;
      pixels[at + 1] = colour.g;
      pixels[at + 2] = colour.b;
      pixels[at + 3] = 255;
      return;
    }

    // Source-over against what is already there, so translucent fills stack.
    const alpha = colour.a / 255;
    const inverse = 1 - alpha;
    pixels[at] = clampByte(colour.r * alpha + (pixels[at] ?? 0) * inverse);
    pixels[at + 1] = clampByte(colour.g * alpha + (pixels[at + 1] ?? 0) * inverse);
    pixels[at + 2] = clampByte(colour.b * alpha + (pixels[at + 2] ?? 0) * inverse);
    pixels[at + 3] = clampByte(colour.a + (pixels[at + 3] ?? 0) * inverse);
  };

  const rect = (x: number, y: number, w: number, h: number, colour: Colour): void => {
    const rgba = parseColour(colour);
    for (let py = Math.round(y); py < Math.round(y) + Math.round(h); py += 1) {
      for (let px = Math.round(x); px < Math.round(x) + Math.round(w); px += 1) {
        set(px, py, rgba);
      }
    }
  };

  const line = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    colour: Colour,
    weight = 1,
  ): void => {
    const rgba = parseColour(colour);
    const spread = Math.floor((weight - 1) / 2);

    // Bresenham, with the pen thickened across the shallower axis so a diagonal
    // does not come out thinner than a horizontal of the same weight.
    let sx = Math.round(x0);
    let sy = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - sx);
    const dy = -Math.abs(ey - sy);
    const stepX = sx < ex ? 1 : -1;
    const stepY = sy < ey ? 1 : -1;
    let error = dx + dy;
    const steep = dx < -dy;

    for (;;) {
      for (let offset = -spread; offset <= spread + ((weight - 1) % 2); offset += 1) {
        if (steep) {
          set(sx + offset, sy, rgba);
        } else {
          set(sx, sy + offset, rgba);
        }
      }

      if (sx === ex && sy === ey) {
        return;
      }
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        sx += stepX;
      }
      if (doubled <= dx) {
        error += dx;
        sy += stepY;
      }
    }
  };

  return {
    width,
    height,
    pixels,
    set,
    rect,
    line,

    fill: (colour) => {
      rect(0, 0, width, height, colour);
    },

    dashedRow: (y, x0, x1, colour, on = 3, off = 4) => {
      const rgba = parseColour(colour);
      for (let x = Math.round(x0); x <= Math.round(x1); x += 1) {
        if ((x - Math.round(x0)) % (on + off) < on) {
          set(x, y, rgba);
        }
      }
    },

    dashedLine: (x0, y0, x1, y1, colour, weight = 1, on = 5, off = 5) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const length = Math.hypot(dx, dy);
      if (length === 0) {
        line(x0, y0, x1, y1, colour, weight);
        return;
      }

      for (let start = 0; start < length; start += on + off) {
        const end = Math.min(length, start + on);
        line(
          x0 + (dx * start) / length,
          y0 + (dy * start) / length,
          x0 + (dx * end) / length,
          y0 + (dy * end) / length,
          colour,
          weight,
        );
      }
    },

    disc: (cx, cy, radius, colour) => {
      const rgba = parseColour(colour);
      for (let y = -radius; y <= radius; y += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (x * x + y * y <= radius * radius) {
            set(cx + x, cy + y, rgba);
          }
        }
      }
    },

    triangle: (cx, cy, radius, up, colour) => {
      const rgba = parseColour(colour);
      for (let row = 0; row <= radius * 2; row += 1) {
        const y = up ? cy - radius + row : cy + radius - row;
        const half = Math.round((row / (radius * 2)) * radius);
        for (let x = -half; x <= half; x += 1) {
          set(cx + x, y, rgba);
        }
      }
    },

    toPng: () => encodePng(width, height, pixels),
  };
};
