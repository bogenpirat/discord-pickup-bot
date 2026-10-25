import { fitWithin, flatten, stackVertically } from '../lib/image/compose.ts';
import { decodeImage, encodeJpeg, type ImageFormat, sniffFormat } from '../lib/image/decode.ts';

/** An image ready to attach: its file name decides the extension Discord reads it by. */
export interface BannerImage {
  readonly name: string;
  readonly bytes: Buffer;
}

/** Downloads an image, or null when it cannot be had. Never throws. */
export type ImageFetch = (url: string) => Promise<Uint8Array | null>;

export interface BannerSources {
  /** The server operator's own banner, if they set one. */
  readonly serverImageUrl: string | null;
  /** wardogserverlist.com's rendered status card, if the server has a link key. */
  readonly cardUrl: string | null;
}

const FILE_STEM = 'wardogs';
const EXTENSIONS: Readonly<Record<ImageFormat, string>> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
};

/** Server banners are mostly 4:1 strips, but a square one should not tower over the card. */
const MAX_SERVER_BANNER_HEIGHT = 600;
const BACKGROUND = { r: 0x0d, g: 0x0e, b: 0x10 };
const JPEG_QUALITY = 85;

const asIs = (bytes: Uint8Array, format: ImageFormat): BannerImage => ({
  name: `${FILE_STEM}.${EXTENSIONS[format]}`,
  bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
});

interface Downloaded {
  readonly bytes: Uint8Array;
  readonly format: ImageFormat;
}

const download = async (fetchImage: ImageFetch, url: string | null): Promise<Downloaded | null> => {
  if (url === null) {
    return null;
  }
  const bytes = await fetchImage(url);
  const format = bytes === null ? null : sniffFormat(bytes);
  return bytes === null || format === null ? null : { bytes, format };
};

/**
 * The server's own banner stacked above the site's status card, as one JPEG.
 * When only one of them can be downloaded, that one is passed on untouched, so
 * a format this bot cannot decode (WebP, GIF) still shows on its own. When both
 * download but one will not decode, the other is used alone; when neither is
 * there, there is no image.
 */
export const assembleBanner = async (
  sources: BannerSources,
  fetchImage: ImageFetch,
): Promise<BannerImage | null> => {
  const [server, card] = await Promise.all([
    download(fetchImage, sources.serverImageUrl),
    download(fetchImage, sources.cardUrl),
  ]);

  if (server === null || card === null) {
    const only = server ?? card;
    return only === null ? null : asIs(only.bytes, only.format);
  }

  const serverRaster = decodeImage(server.bytes);
  const cardRaster = decodeImage(card.bytes);
  if (serverRaster === null || cardRaster === null) {
    // Prefer the card: it is the one that carries the server's live status.
    return cardRaster !== null ? asIs(card.bytes, card.format) : asIs(server.bytes, server.format);
  }

  // Scaled to the card's width, so the two read as one picture.
  const top = fitWithin(
    flatten(serverRaster, BACKGROUND),
    cardRaster.width,
    MAX_SERVER_BANNER_HEIGHT,
  );
  const merged = stackVertically([top, flatten(cardRaster, BACKGROUND)], BACKGROUND);

  return { name: `${FILE_STEM}.jpg`, bytes: encodeJpeg(merged, JPEG_QUALITY) };
};
