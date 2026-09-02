import { describe, expect, it } from 'vitest';
import { valoAccountCommand } from '../../src/commands/valoAccount.ts';
import type { Account, Content } from '../../src/valorant/types.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';
import { fakeValorantClient, SAMPLE_CONTENT } from '../helpers/valorant.ts';

const ACCOUNT: Account = {
  puuid: 'puuid-1',
  region: 'eu',
  account_level: 200,
  name: 'Bogenpirat',
  tag: 'EUW',
  card: 'card-1',
  title: 'title-1',
  platforms: ['pc'],
  updated_at: '2026-07-27T13:00:00Z',
};

const linkInteraction = (riotId: string, userId = 'user-1') =>
  createFakeCommandInteraction({
    commandName: 'valo-account',
    subcommand: 'link',
    strings: { 'riot-id': riotId },
    userId,
  });

describe('/valo-account link', () => {
  it('refuses when no api key is configured', async () => {
    const context = createTestContext();
    const fake = linkInteraction('Bogenpirat#EUW');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('VALORANT_API_KEY');
  });

  it('rejects a riot id without a tag before spending a request', async () => {
    const client = fakeValorantClient({ account: { ok: true, value: ACCOUNT } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Bogenpirat');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('keine gültige Riot-ID');
    expect(client.calls).toEqual([]);
  });

  it('explains which part of the riot id was wrong', async () => {
    const client = fakeValorantClient({ account: { ok: true, value: ACCOUNT } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Bogenpirat#E');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('3 bis 5 Buchstaben');
  });

  it('stores the puuid returned for the riot id', async () => {
    const client = fakeValorantClient({ account: { ok: true, value: ACCOUNT } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Bogenpirat#EUW');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(client.calls).toEqual([['getAccount', 'Bogenpirat', 'EUW']]);
    expect(context.riotAccounts.find('user-1')).toMatchObject({
      puuid: 'puuid-1',
      riotName: 'Bogenpirat',
      riotTag: 'EUW',
      region: 'eu',
    });
    expect(fake.messages().join(' ')).toContain('puuid-1');
  });

  it('defers first, because the request may outlast the ack window', async () => {
    const client = fakeValorantClient({ account: { ok: true, value: ACCOUNT } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Bogenpirat#EUW');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.calls[0]?.method).toBe('deferReply');
  });

  it('reports a riot id riot does not know', async () => {
    const client = fakeValorantClient({ account: { ok: false, error: { kind: 'not-found' } } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Nobody#XXX');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Riot kennt **Nobody#XXX** nicht');
    expect(context.riotAccounts.find('user-1')).toBeUndefined();
  });

  it('reports a rejected api key', async () => {
    const client = fakeValorantClient({ account: { ok: false, error: { kind: 'unauthorized' } } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Bogenpirat#EUW');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('abgelehnt');
  });

  it('reports an exhausted rate limit', async () => {
    const client = fakeValorantClient({ account: { ok: false, error: { kind: 'rate-limited' } } });
    const context = createTestContext(undefined, [], client.client);
    const fake = linkInteraction('Bogenpirat#EUW');

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Limit');
  });

  it('refuses to hand one riot account to a second member', async () => {
    const client = fakeValorantClient({ account: { ok: true, value: ACCOUNT } });
    const context = createTestContext(undefined, [], client.client);

    await valoAccountCommand.execute(linkInteraction('Bogenpirat#EUW').interaction, context);

    const second = linkInteraction('Bogenpirat#EUW', 'user-2');
    await valoAccountCommand.execute(second.interaction, context);

    expect(second.messages().join(' ')).toContain('bereits mit <@user-1> verknüpft');
    expect(context.riotAccounts.find('user-2')).toBeUndefined();
  });

  it('lets the same member relink their own account', async () => {
    const client = fakeValorantClient({ account: { ok: true, value: ACCOUNT } });
    const context = createTestContext(undefined, [], client.client);

    await valoAccountCommand.execute(linkInteraction('Bogenpirat#EUW').interaction, context);
    const again = linkInteraction('Bogenpirat#EUW');
    await valoAccountCommand.execute(again.interaction, context);

    expect(again.messages().join(' ')).toContain('Verknüpft mit');
  });
});

describe('/valo-account show', () => {
  const showInteraction = (user?: { id: string }) =>
    createFakeCommandInteraction({
      commandName: 'valo-account',
      subcommand: 'show',
      ...(user === undefined ? {} : { users: { user } }),
    });

  it('tells an unlinked member how to link', async () => {
    const context = createTestContext();
    const fake = showInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('/valo-account verknüpfen');
  });

  it('reports that someone else has not linked', async () => {
    const context = createTestContext();
    const fake = showInteraction({ id: 'user-9' });

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('<@user-9> hat noch keine Riot-ID');
  });

  it('shows a stored riot id without calling the api', async () => {
    const client = fakeValorantClient({});
    const context = createTestContext(undefined, [], client.client);
    context.riotAccounts.link(
      {
        discordUserId: 'user-1',
        puuid: 'puuid-1',
        riotName: 'Bogenpirat',
        riotTag: 'EUW',
        region: 'eu',
      },
      1_000,
    );
    const fake = showInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Bogenpirat#EUW');
    expect(client.calls).toEqual([]);
  });

  it('works without an api key configured', async () => {
    const context = createTestContext();
    context.riotAccounts.link(
      {
        discordUserId: 'user-1',
        puuid: 'puuid-1',
        riotName: 'Bogenpirat',
        riotTag: 'EUW',
        region: 'eu',
      },
      1_000,
    );
    const fake = showInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('Bogenpirat#EUW');
  });
});

describe('the player card that comes back with an account', () => {
  const CARD = 'e9a3d874-4893-b17a-00ca-0b88017f7919';

  const embedsOf = (fake: ReturnType<typeof createFakeCommandInteraction>) =>
    fake.calls.flatMap((call) => {
      const payload = call.payload as { embeds?: { data: Record<string, unknown> }[] } | null;
      return payload?.embeds ?? [];
    });

  const linkWith = async (card: string, withContent = true) => {
    const client = fakeValorantClient({
      account: { ok: true, value: { ...ACCOUNT, card } },
      ...(withContent
        ? { content: { ok: true, value: SAMPLE_CONTENT as unknown as Content } }
        : {}),
    });
    const context = createTestContext(undefined, [], client.client);
    if (withContent) {
      await context.content.load();
    }
    const fake = linkInteraction('Bogenpirat#EUW');

    await valoAccountCommand.execute(fake.interaction, context);
    return fake;
  };

  it('shows the card as a thumbnail, captioned with the name from the dump', async () => {
    const [embed] = embedsOf(await linkWith(CARD));

    expect(embed?.data['thumbnail']).toEqual({
      url: `https://media.valorant-api.com/playercards/${CARD}/smallart.png`,
    });
    expect(embed?.data['footer']).toEqual({ text: 'Banner „Neo Frontier“' });
  });

  it('still shows the picture when the content dump was never read', async () => {
    const [embed] = embedsOf(await linkWith(CARD, false));

    expect(embed?.data['thumbnail']).toBeDefined();
    // Nothing to caption it with, and a uuid would be worse than nothing.
    expect(embed?.data['footer']).toBeUndefined();
  });

  it('keeps the confirmation itself in words, not in the embed', async () => {
    const fake = await linkWith(CARD);

    expect(fake.messages().join(' ')).toContain('Bogenpirat#EUW');
    expect(embedsOf(fake)[0]?.data['description']).toBeUndefined();
  });

  it('says the same thing with no embed at all when there is no card to show', async () => {
    const fake = await linkWith('not-a-uuid');

    expect(embedsOf(fake)).toEqual([]);
    expect(fake.messages().join(' ')).toContain('Bogenpirat#EUW');
  });
});

describe('/valo-account refresh', () => {
  const refreshInteraction = () =>
    createFakeCommandInteraction({ commandName: 'valo-account', subcommand: 'refresh' });

  const withLink = (client: ReturnType<typeof fakeValorantClient>) => {
    const context = createTestContext(undefined, [], client.client);
    context.riotAccounts.link(
      {
        discordUserId: 'user-1',
        puuid: 'puuid-1',
        riotName: 'Bogenpirat',
        riotTag: 'EUW',
        region: 'eu',
      },
      1_000,
    );
    return context;
  };

  it('asks an unlinked member to link first', async () => {
    const client = fakeValorantClient({});
    const context = createTestContext(undefined, [], client.client);
    const fake = refreshInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('noch keine Riot-ID hinterlegt');
    expect(client.calls).toEqual([]);
  });

  it('looks the account up by puuid, not by name', async () => {
    const client = fakeValorantClient({ accountByPuuid: { ok: true, value: ACCOUNT } });
    const fake = refreshInteraction();

    await valoAccountCommand.execute(fake.interaction, withLink(client));

    expect(client.calls).toEqual([['getAccountByPuuid', 'puuid-1']]);
  });

  it('says nothing changed when the riot id is unchanged', async () => {
    const client = fakeValorantClient({ accountByPuuid: { ok: true, value: ACCOUNT } });
    const fake = refreshInteraction();

    await valoAccountCommand.execute(fake.interaction, withLink(client));

    expect(fake.messages().join(' ')).toContain('Alles aktuell');
  });

  it('shows the card again on a refresh, in case that is what changed', async () => {
    const client = fakeValorantClient({
      accountByPuuid: {
        ok: true,
        value: { ...ACCOUNT, card: 'e9a3d874-4893-b17a-00ca-0b88017f7919' },
      },
    });
    const fake = refreshInteraction();

    await valoAccountCommand.execute(fake.interaction, withLink(client));

    const embeds = fake.calls.flatMap((call) => {
      const payload = call.payload as { embeds?: { data: Record<string, unknown> }[] } | null;
      return payload?.embeds ?? [];
    });
    expect(embeds[0]?.data['thumbnail']).toEqual({
      url: 'https://media.valorant-api.com/playercards/e9a3d874-4893-b17a-00ca-0b88017f7919/smallart.png',
    });
  });

  it('writes back a renamed riot id', async () => {
    const client = fakeValorantClient({
      accountByPuuid: { ok: true, value: { ...ACCOUNT, name: 'NeuerName', tag: 'DE1' } },
    });
    const context = withLink(client);
    const fake = refreshInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('NeuerName#DE1');
    expect(context.riotAccounts.find('user-1')).toMatchObject({
      riotName: 'NeuerName',
      riotTag: 'DE1',
      linkedAt: 1_000,
    });
  });

  it('keeps the stored link when the api fails', async () => {
    const client = fakeValorantClient({
      accountByPuuid: { ok: false, error: { kind: 'network' } },
    });
    const context = withLink(client);
    const fake = refreshInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('antwortet gerade nicht');
    expect(context.riotAccounts.find('user-1')?.riotName).toBe('Bogenpirat');
  });
});

describe('/valo-account unlink', () => {
  const unlinkInteraction = () =>
    createFakeCommandInteraction({ commandName: 'valo-account', subcommand: 'unlink' });

  it('removes a stored link without an api key', async () => {
    const context = createTestContext();
    context.riotAccounts.link(
      {
        discordUserId: 'user-1',
        puuid: 'puuid-1',
        riotName: 'Bogenpirat',
        riotTag: 'EUW',
        region: 'eu',
      },
      1_000,
    );
    const fake = unlinkInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nicht mehr hinterlegt');
    expect(context.riotAccounts.find('user-1')).toBeUndefined();
  });

  it('says there was nothing to remove', async () => {
    const context = createTestContext();
    const fake = unlinkInteraction();

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('noch keine Riot-ID hinterlegt');
  });
});

describe('/valo-account outside a guild', () => {
  it('refuses', async () => {
    const context = createTestContext();
    const fake = createFakeCommandInteraction({
      commandName: 'valo-account',
      subcommand: 'show',
      guildId: null,
    });

    await valoAccountCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });
});
