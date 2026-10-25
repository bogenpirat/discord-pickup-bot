import type { APIEmbed } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { wdCommand } from '../../src/commands/wd.ts';
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
) => {
  const wardogs = fakeWardogsClient(result, banner);
  const context = createTestContext(undefined, [], null, undefined, wardogs.client);
  const fake = createFakeCommandInteraction({
    commandName: 'wd',
    locale: 'en-US',
    strings: { 'server-id': input },
  });
  await wdCommand.execute(fake.interaction, context);
  return { fake, wardogs };
};

interface EditPayload {
  embeds?: { toJSON(): APIEmbed }[];
  files?: { name: string | null }[];
}

const edited = (fake: ReturnType<typeof createFakeCommandInteraction>): EditPayload =>
  fake.calls.find((call) => call.method === 'editReply')?.payload as EditPayload;

const editedEmbeds = (fake: ReturnType<typeof createFakeCommandInteraction>): APIEmbed[] =>
  (edited(fake).embeds ?? []).map((embed) => embed.toJSON());

describe('/wd', () => {
  it('posts the server embed publicly', async () => {
    const { fake, wardogs } = await run(GUID, parseServerDetailResponse(SAMPLE_RESPONSE));

    expect(wardogs.calls).toEqual([`id|${GUID}`]);
    expect(fake.calls[0]).toEqual({ method: 'deferReply', payload: undefined });
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
