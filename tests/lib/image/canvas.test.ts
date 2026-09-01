import { describe, expect, it } from 'vitest';
import { type Canvas, createCanvas, parseColour } from '../../../src/lib/image/canvas.ts';

const pixelAt = (canvas: Canvas, x: number, y: number): number[] => {
  const at = (y * canvas.width + x) * 4;
  return [...canvas.pixels.subarray(at, at + 4)];
};

const painted = (canvas: Canvas): number => {
  let count = 0;
  for (let at = 3; at < canvas.pixels.length; at += 4) {
    if ((canvas.pixels[at] ?? 0) > 0) {
      count += 1;
    }
  }
  return count;
};

describe('parseColour', () => {
  it('reads six-digit hex as fully opaque', () => {
    expect(parseColour('#ff4655')).toEqual({ r: 255, g: 70, b: 85, a: 255 });
  });

  it('reads the alpha from eight-digit hex', () => {
    expect(parseColour('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 });
  });

  it('tolerates a missing hash', () => {
    expect(parseColour('4ade80')).toEqual({ r: 74, g: 222, b: 128, a: 255 });
  });

  it.each(['#fff', '#ff46', 'rgb(1,2,3)'])('rejects %o', (value) => {
    expect(() => parseColour(value)).toThrow(/unsupported colour/);
  });
});

describe('createCanvas', () => {
  it('starts fully transparent', () => {
    expect(painted(createCanvas(4, 4))).toBe(0);
  });

  it('fills every pixel', () => {
    const canvas = createCanvas(3, 2);
    canvas.fill('#112233');

    expect(painted(canvas)).toBe(6);
    expect(pixelAt(canvas, 2, 1)).toEqual([0x11, 0x22, 0x33, 255]);
  });

  it('drops writes outside its bounds instead of wrapping', () => {
    const canvas = createCanvas(2, 2);
    const colour = parseColour('#ffffff');

    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 2],
    ] as const) {
      canvas.set(x, y, colour);
    }

    expect(painted(canvas)).toBe(0);
  });

  it('blends a translucent colour over what is there', () => {
    const canvas = createCanvas(1, 1);
    canvas.fill('#000000');
    canvas.rect(0, 0, 1, 1, '#ffffff80');

    const [r, , , a] = pixelAt(canvas, 0, 0);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
    expect(a).toBe(255);
  });

  it('draws a horizontal line of the requested length', () => {
    const canvas = createCanvas(10, 3);
    canvas.line(2, 1, 7, 1, '#ffffff');

    expect(painted(canvas)).toBe(6);
    expect(pixelAt(canvas, 2, 1)[3]).toBe(255);
    expect(pixelAt(canvas, 7, 1)[3]).toBe(255);
    expect(pixelAt(canvas, 8, 1)[3]).toBe(0);
  });

  it('draws a vertical line', () => {
    const canvas = createCanvas(3, 10);
    canvas.line(1, 2, 1, 7, '#ffffff');

    expect(painted(canvas)).toBe(6);
  });

  it('draws a diagonal that touches both ends', () => {
    const canvas = createCanvas(8, 8);
    canvas.line(0, 0, 7, 7, '#ffffff');

    expect(pixelAt(canvas, 0, 0)[3]).toBe(255);
    expect(pixelAt(canvas, 7, 7)[3]).toBe(255);
    expect(painted(canvas)).toBe(8);
  });

  it('thickens a line by its weight', () => {
    const thin = createCanvas(10, 5);
    thin.line(1, 2, 8, 2, '#ffffff');
    const thick = createCanvas(10, 5);
    thick.line(1, 2, 8, 2, '#ffffff', 3);

    expect(painted(thick)).toBeGreaterThan(painted(thin));
  });

  it('draws a single point when both ends coincide', () => {
    const canvas = createCanvas(4, 4);
    canvas.line(2, 2, 2, 2, '#ffffff');

    expect(painted(canvas)).toBe(1);
  });

  it('leaves gaps in a dashed row', () => {
    const canvas = createCanvas(20, 1);
    canvas.dashedRow(0, 0, 19, '#ffffff', 2, 2);

    expect(painted(canvas)).toBeGreaterThan(0);
    expect(painted(canvas)).toBeLessThan(20);
  });

  it('draws a disc that is round and centred', () => {
    const canvas = createCanvas(11, 11);
    canvas.disc(5, 5, 3, '#ffffff');

    expect(pixelAt(canvas, 5, 5)[3]).toBe(255);
    expect(pixelAt(canvas, 5, 2)[3]).toBe(255);
    expect(pixelAt(canvas, 2, 2)[3]).toBe(0); // the corner is outside the radius
  });

  it('points a triangle the way it is asked to', () => {
    const up = createCanvas(11, 11);
    up.triangle(5, 5, 3, true, '#ffffff');
    const down = createCanvas(11, 11);
    down.triangle(5, 5, 3, false, '#ffffff');

    // The apex is a single pixel; the base is wide.
    expect(pixelAt(up, 5, 2)[3]).toBe(255);
    expect(pixelAt(up, 2, 2)[3]).toBe(0);
    expect(pixelAt(down, 5, 8)[3]).toBe(255);
    expect(pixelAt(down, 2, 8)[3]).toBe(0);
  });

  it('encodes itself as a png of the right dimensions', () => {
    const canvas = createCanvas(6, 4);
    canvas.fill('#123456');
    const png = canvas.toPng();

    expect(png.readUInt32BE(16)).toBe(6);
    expect(png.readUInt32BE(20)).toBe(4);
  });
});
