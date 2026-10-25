import type { APIActionRowComponent, APIButtonComponentWithURL, APIEmbed } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { wdCommand, wdPrivateCommand } from '../../src/commands/wd.ts';
import { parseServerDetailResponse } from '../../src/domain/wardogs/parseServerDetail.ts';
import type { BannerImage } from '../../src/wardogs/banner.ts';
import type { WardogsLookupResult } from '../../src/wardogs/client.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';
import { fakeWardogsClient, SAMPLE_RESPONSE } from '../helpers/wardogs.ts';

const GUID = '91052133-1e18-4af8-b54e-499ab279f446';

const run = async (
  input: string,
  result: WardogsLookupResult,
  banner: BannerImage | null = null,
  command = wdCommand,
  publicBaseUrl: string | null = null,
) => {
  const wardogs = fakeWardogsClient(result, banner);
  const context = {
    ...createTestContext(undefined, [], null, undefined, wardogs.client),
    publicBaseUrl,
  };
  const fake = createFakeCommandInteraction({
    commandName: command.name,
    locale: 'en-US',
    strings: { 'server-id': input },
  });
  await command.execute(fake.interaction, context);
  return { fake, wardogs };
};

interface EditPayload {
  embeds?: { toJSON(): APIEmbed }[];
  files?: { name: string | null }[];
  components?: { toJSON(): APIActionRowComponent<APIButtonComponentWithURL> }[];
}

const edited = (fake: ReturnType<typeof createFakeCommandInteraction>): EditPayload =>
  fake.calls.find((call) => call.method === 'editReply')?.payload as EditPayload;

const editedEmbeds = (fake: ReturnType<typeof createFakeCommandInteraction>): APIEmbed[] =>
  (edited(fake).embeds ?? []).map((embed) => embed.toJSON());

describe('/wd', () => {
  it('posts the server embed publicly', async () => {
    const { fake, wardogs } = await run(GUID, parseServerDetailResponse(SAMPLE_RESPONSE));

    expect(wardogs.calls).toEqual([`id|${GUID}`]);
    expect(fake.calls[0]).toEqual({ method: 'deferReply', payload: {} });
    expect(editedEmbeds(fake)[0]?.title).toBe('ASDZ - Alte Säcke Die Zocken | DE | GER');
  });

  it('attaches the banner and shows it as the image', async () => {
    const { fake } = await run(GUID, parseServerDetailResponse(SAMPLE_RESPONSE), {
      name: 'wardogs.jpg',
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
    });

    expect(edited(fake).files?.map((file) => file.name)).toEqual(['wardogs.jpg']);
    expect(editedEmbeds(fake)[0]?.image?.url).toBe('attachment://wardogs.jpg');
  });

  it('posts without an image when there is no banner', async () => {
    const { fake } = await run(GUID, parseServerDetailResponse(SAMPLE_RESPONSE));

    expect(edited(fake).files).toEqual([]);
    expect(editedEmbeds(fake)[0]?.image).toBeUndefined();
  });

  it('adds a join button through the bot when it has a public url', async () => {
    const { fake } = await run(
      GUID,
      parseServerDetailResponse(SAMPLE_RESPONSE),
      null,
      wdCommand,
      'https://bot.example.net',
    );

    const buttons = (edited(fake).components ?? []).flatMap((row) => row.toJSON().components);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.label).toBe('Join');
    expect(buttons[0]?.url).toBe(`https://bot.example.net/pickup/wardogs/join/${GUID}?lang=en`);
  });

  it('adds no join button without a public url', async () => {
    const { fake } = await run(GUID, parseServerDetailResponse(SAMPLE_RESPONSE));
    expect(edited(fake).components).toEqual([]);
  });

  it.each(['foo', '682028'])('refuses %j privately without asking the api', async (input) => {
    const { fake, wardogs } = await run(input, { kind: 'error' });

    expect(wardogs.calls).toEqual([]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe('reply');
    expect(fake.messages().join(' ')).toContain('not a valid server id');
  });

  it.each([
    [{ kind: 'not-found' }, 'does not know a server'],
    [{ kind: 'offline' }, 'not online'],
    [{ kind: 'rate-limited' }, 'too many requests'],
    [{ kind: 'error' }, 'not responding'],
    [{ kind: 'invalid' }, 'not responding'],
  ] as const)('explains %j', async (result, text) => {
    const { fake } = await run(GUID, result);
    expect(fake.messages().join(' ')).toContain(text);
  });
});

describe('/wd-private', () => {
  it('defers ephemerally', async () => {
    const { fake } = await run(
      GUID,
      parseServerDetailResponse(SAMPLE_RESPONSE),
      null,
      wdPrivateCommand,
    );

    expect(fake.calls[0]).toEqual({ method: 'deferReply', payload: { flags: 64 } });
  });

  it('produces the same reply as /wd', async () => {
    const banner = { name: 'wardogs.jpg', bytes: Buffer.from([0xff, 0xd8, 0xff]) };
    const open = await run(GUID, parseServerDetailResponse(SAMPLE_RESPONSE), banner);
    const quiet = await run(
      GUID,
      parseServerDetailResponse(SAMPLE_RESPONSE),
      banner,
      wdPrivateCommand,
    );

    expect(editedEmbeds(quiet.fake)).toEqual(editedEmbeds(open.fake));
    expect(edited(quiet.fake).files?.map((file) => file.name)).toEqual(['wardogs.jpg']);
  });
});
