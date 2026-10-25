import { describe, expect, it } from 'vitest';
import { decodeImage, sniffFormat } from '../../src/lib/image/decode.ts';
import { assembleBanner, type ImageFetch } from '../../src/wardogs/banner.ts';
import { ascii, pixelAt, solidJpeg, solidPng } from '../helpers/images.ts';

const SERVER_URL = 'https://files.example/server.png';
const CARD_URL = 'https://wardogserverlist.example/banner.jpg';
const SOURCES = { serverImageUrl: SERVER_URL, cardUrl: CARD_URL };

const WEBP = Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WEBPVP8 ')]);

/** Serves fixed bytes per URL and remembers what was asked for. */
const serving = (files: Readonly<Record<string, Uint8Array | null>>) => {
  const asked: string[] = [];
  const fetchImage: ImageFetch = async (url) => {
    asked.push(url);
    return files[url] ?? null;
  };
  return { asked, fetchImage };
};

describe('assembleBanner', () => {
  it('stacks the server banner, scaled to the card width, above the card', async () => {
    const { fetchImage } = serving({
      [SERVER_URL]: solidPng(40, 10, [255, 0, 0, 255]),
      [CARD_URL]: solidJpeg(120, 50, [0, 0, 255]),
    });

    const banner = await assembleBanner(SOURCES, fetchImage);

    expect(banner?.name).toBe('wardogs.jpg');
    const merged = banner && decodeImage(banner.bytes);
    expect(merged).toMatchObject({ width: 120, height: 30 + 50 });
    const [r, , b] = merged ? pixelAt(merged, 60, 10) : [];
    expect(r).toBeGreaterThan(200);
    const [r2, , b2] = merged ? pixelAt(merged, 60, 60) : [];
    expect(b2).toBeGreaterThan(200);
    expect(r2).toBeLessThan(50);
    expect(b).toBeLessThan(50);
  });

  it('caps a tall server banner so it does not tower over the card', async () => {
    const { fetchImage } = serving({
      [SERVER_URL]: solidPng(100, 100, [255, 0, 0, 255]),
      [CARD_URL]: solidJpeg(1200, 500, [0, 0, 255]),
    });

    const banner = await assembleBanner(SOURCES, fetchImage);

    expect(banner && decodeImage(banner.bytes)).toMatchObject({ width: 1200, height: 600 + 500 });
  });

  it('flattens a transparent server banner onto the dark background', async () => {
    const { fetchImage } = serving({
      [SERVER_URL]: solidPng(12, 3, [255, 255, 255, 0]),
      [CARD_URL]: solidJpeg(12, 4, [0, 0, 255]),
    });

    const banner = await assembleBanner(SOURCES, fetchImage);
    const merged = banner && decodeImage(banner.bytes);
    const [r, g, b] = merged ? pixelAt(merged, 6, 1) : [];

    expect(Math.max(r ?? 255, g ?? 255, b ?? 255)).toBeLessThan(40);
  });

  it.each([
    ['only the server banner', { [SERVER_URL]: solidPng(4, 1, [1, 2, 3, 255]) }, 'wardogs.png'],
    ['only the card', { [CARD_URL]: solidJpeg(4, 1, [1, 2, 3]) }, 'wardogs.jpg'],
    ['only a webp server banner', { [SERVER_URL]: WEBP }, 'wardogs.webp'],
  ])('passes %s on untouched', async (_label, files, name) => {
    const { fetchImage } = serving(files);
    const only = Object.values(files)[0];

    const banner = await assembleBanner(SOURCES, fetchImage);

    expect(banner?.name).toBe(name);
    expect(banner?.bytes.equals(Buffer.from(only ?? []))).toBe(true);
  });

  it('treats a download that is not an image as missing', async () => {
    const card = solidJpeg(4, 1, [1, 2, 3]);
    const { fetchImage } = serving({ [SERVER_URL]: ascii('<html>'), [CARD_URL]: card });

    const banner = await assembleBanner(SOURCES, fetchImage);

    expect(banner?.bytes.equals(card)).toBe(true);
  });

  it('uses the card alone when the server banner will not decode', async () => {
    const card = solidJpeg(4, 1, [1, 2, 3]);
    const { fetchImage } = serving({ [SERVER_URL]: WEBP, [CARD_URL]: card });

    const banner = await assembleBanner(SOURCES, fetchImage);

    expect(banner?.name).toBe('wardogs.jpg');
    expect(banner?.bytes.equals(card)).toBe(true);
  });

  it('uses the server banner alone when the card will not decode', async () => {
    const server = solidPng(4, 1, [1, 2, 3, 255]);
    const brokenCard = solidJpeg(8, 8, [1, 2, 3]).subarray(0, 40);
    const { fetchImage } = serving({ [SERVER_URL]: server, [CARD_URL]: brokenCard });

    const banner = await assembleBanner(SOURCES, fetchImage);

    expect(banner?.name).toBe('wardogs.png');
    expect(banner?.bytes.equals(server)).toBe(true);
  });

  it('has no image when neither downloads', async () => {
    expect(await assembleBanner(SOURCES, serving({}).fetchImage)).toBeNull();
  });

  it('does not ask for a source it has no url for', async () => {
    const { asked, fetchImage } = serving({});

    expect(await assembleBanner({ serverImageUrl: null, cardUrl: null }, fetchImage)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('produces a jpeg when merging', async () => {
    const { fetchImage } = serving({
      [SERVER_URL]: solidPng(8, 2, [1, 2, 3, 255]),
      [CARD_URL]: solidJpeg(8, 2, [1, 2, 3]),
    });
    const banner = await assembleBanner(SOURCES, fetchImage);
    expect(banner && sniffFormat(banner.bytes)).toBe('jpeg');
  });
});
