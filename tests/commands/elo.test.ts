import { describe, expect, it } from 'vitest';
import { eloCommand } from '../../src/commands/elo.ts';
import type { Account, Mmr, MmrHistory } from '../../src/valorant/types.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';
import { fakeValorantClient } from '../helpers/valorant.ts';

const ADMIN_ROLE = 'role-admin';

const MMR: Mmr = {
  account: { name: 'Bogenpirat', tag: 'EUW', puuid: 'puuid-1' },
  current: {
    tier: { id: 22, name: 'Immortal 2' },
    rr: 47,
    last_change: 21,
    elo: 1947,
    games_needed_for_rating: 0,
    rank_protection_shields: 0,
    leaderboard_placement: null,
  },
  peak: {
    season: { id: 'season-1', short: 'e10a3' },
    ranking_schema: 'tiers',
    tier: { id: 23, name: 'Immortal 3' },
    rr: 12,
  },
  seasonal: [],
};

const historyEntry = (tierId: number, rr: number, change: number, minutes: number) => ({
  elo: (tierId - 3) * 100 + rr,
  rr,
  last_change: change,
  date: new Date(Date.parse('2026-08-01T18:00:00Z') + minutes * 60_000).toISOString(),
  tier: { id: tierId, name: tierId === 22 ? 'Immortal 2' : 'Immortal 1' },
  map: { id: 'map-1', name: 'Ascent' },
  match_id: `match-${minutes}`,
  season: { id: 'season-1', short: 'e10a3' },
  refunded_rr: 0,
  was_derank_protected: false,
});

const HISTORY = {
  account: { name: 'Bogenpirat', tag: 'EUW', puuid: 'puuid-1' },
  history: [
    historyEntry(22, 47, 21, 120),
    historyEntry(22, 26, 26, 60),
    historyEntry(21, 100, 25, 0),
  ],
} as unknown as MmrHistory;

const ACCOUNT: Account = {
  puuid: 'puuid-2',
  region: 'na',
  account_level: 100,
  name: 'Someone',
  tag: 'NA1',
  card: 'card',
  title: 'title',
  platforms: ['pc'],
  updated_at: '2026-08-01T18:00:00Z',
};

const healthy = () =>
  fakeValorantClient({ mmr: { ok: true, value: MMR }, mmrHistory: { ok: true, value: HISTORY } });

const linked = (
  client: ReturnType<typeof fakeValorantClient>,
  region = 'eu',
  powerUserIds: readonly string[] = [],
) => {
  const context = createTestContext(undefined, powerUserIds, client.client);
  context.riotAccounts.link(
    {
      discordUserId: 'user-1',
      puuid: 'puuid-1',
      riotName: 'Bogenpirat',
      riotTag: 'EUW',
      region,
    },
    1_000,
  );
  return context;
};

const eloInteraction = (options: Parameters<typeof createFakeCommandInteraction>[0] = {}) =>
  createFakeCommandInteraction({ commandName: 'elo', ...options });

const editPayload = (
  fake: ReturnType<typeof createFakeCommandInteraction>,
): Record<string, unknown> =>
  (fake.calls.filter((call) => call.method === 'editReply').at(-1)?.payload ?? {}) as Record<
    string,
    unknown
  >;

describe('/elo for yourself', () => {
  it('refuses when no api key is configured', async () => {
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, createTestContext());

    expect(fake.messages().join(' ')).toContain('VALORANT_API_KEY');
  });

  it('asks an unlinked member to link first, without deferring or calling out', async () => {
    const client = healthy();
    const context = createTestContext(undefined, [], client.client);
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, context);

    expect(fake.messages().join(' ')).toContain('noch keine Riot-ID hinterlegt');
    expect(client.calls).toEqual([]);
    // A public defer with an ephemeral refusal would leave a dangling "thinking".
    expect(fake.calls.map((call) => call.method)).not.toContain('deferReply');
  });

  it('looks up the rank and the history for the linked account', async () => {
    const client = healthy();
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(client));

    expect(client.calls).toEqual([
      ['getMmr', 'eu', 'pc', 'Bogenpirat', 'EUW'],
      ['getMmrHistory', 'eu', 'pc', 'Bogenpirat', 'EUW'],
    ]);
  });

  it('uses the region stored with the link', async () => {
    const client = healthy();
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(client, 'ap'));

    expect(client.calls[0]).toEqual(['getMmr', 'ap', 'pc', 'Bogenpirat', 'EUW']);
  });

  it('defers publicly, because the chart is meant to be shared', async () => {
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(healthy()));

    const defer = fake.calls.find((call) => call.method === 'deferReply');
    expect(defer).toBeDefined();
    expect(defer?.payload).toBeUndefined();
  });

  it('answers with an embed and the chart attached', async () => {
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(healthy()));

    const payload = editPayload(fake);
    const files = payload['files'] as { name: string; attachment: Buffer }[];

    expect(payload['embeds']).toHaveLength(1);
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('elo.png');
    expect(files[0]?.attachment.subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('puts the rank, the last change and the peak in the embed', async () => {
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(healthy()));

    const [embed] = editPayload(fake)['embeds'] as { data: Record<string, unknown> }[];
    const fields = embed?.data['fields'] as { name: string; value: string }[];

    expect(embed?.data['title']).toBe('Bogenpirat#EUW');
    expect(embed?.data['image']).toEqual({ url: 'attachment://elo.png' });
    expect(fields.map((field) => field.value)).toContain('Immortal 2 · 47 RR');
    expect(fields.map((field) => field.value)).toContain('+21');
    expect(fields.map((field) => field.value)).toContain('Immortal 3 (e10a3)');
  });

  it('summarises the window in the footer', async () => {
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(healthy()));

    const [embed] = editPayload(fake)['embeds'] as { data: Record<string, unknown> }[];
    const footer = embed?.data['footer'] as { text: string };

    expect(footer.text).toContain('3 Matches');
    expect(footer.text).toContain('3S 0N');
  });

  it('shows a leaderboard placement when there is one', async () => {
    const client = fakeValorantClient({
      mmr: {
        ok: true,
        value: {
          ...MMR,
          current: { ...MMR.current, leaderboard_placement: { rank: 412, updated_at: 'now' } },
        },
      },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(client));

    const [embed] = editPayload(fake)['embeds'] as { data: Record<string, unknown> }[];
    const fields = embed?.data['fields'] as { value: string }[];

    expect(fields.map((field) => field.value)).toContain('#412');
  });

  it('still shows the rank when the history call fails', async () => {
    const client = fakeValorantClient({
      mmr: { ok: true, value: MMR },
      mmrHistory: { ok: false, error: { kind: 'network' } },
    });
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(client));

    const payload = editPayload(fake);
    expect(payload['embeds']).toHaveLength(1);
    expect(payload['files']).toHaveLength(1);
  });

  it('reports an account with no ranked data', async () => {
    const client = fakeValorantClient({
      mmr: { ok: false, error: { kind: 'not-found' } },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(client));

    expect(String(editPayload(fake)['content'])).toContain('keine Ranglisten-Daten');
  });

  it('edits the deferred reply rather than following up when the api fails', async () => {
    const client = fakeValorantClient({
      mmr: { ok: false, error: { kind: 'rate-limited' } },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const fake = eloInteraction();

    await eloCommand.execute(fake.interaction, linked(client));

    expect(String(editPayload(fake)['content'])).toContain('Limit');
    expect(fake.calls.map((call) => call.method)).not.toContain('followUp');
  });

  it('refuses outside a guild', async () => {
    const fake = eloInteraction({ guildId: null });

    await eloCommand.execute(fake.interaction, linked(healthy()));

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });
});

describe('/elo for another riot id', () => {
  const forOther = (options: Parameters<typeof createFakeCommandInteraction>[0] = {}) =>
    eloInteraction({ strings: { 'riot-id': 'Someone#NA1' }, ...options });

  it('refuses a plain member and spends nothing', async () => {
    const client = healthy();
    const fake = forOther();

    await eloCommand.execute(fake.interaction, linked(client));

    expect(fake.messages().join(' ')).toContain('Config-Befehle');
    expect(client.calls).toEqual([]);
  });

  it('allows a member with manage server', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      mmr: { ok: true, value: MMR },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const fake = forOther({ manageGuild: true });

    await eloCommand.execute(fake.interaction, linked(client));

    expect(client.calls).toEqual([
      ['getAccount', 'Someone', 'NA1'],
      ['getMmr', 'na', 'pc', 'Someone', 'NA1'],
      ['getMmrHistory', 'na', 'pc', 'Someone', 'NA1'],
    ]);
  });

  it('allows the configured admin role', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      mmr: { ok: true, value: MMR },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const context = linked(client);
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = forOther({ roleIds: [ADMIN_ROLE] });

    await eloCommand.execute(fake.interaction, context);

    expect(client.calls[0]).toEqual(['getAccount', 'Someone', 'NA1']);
  });

  it('allows a power user', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      mmr: { ok: true, value: MMR },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const fake = forOther({ userId: 'power-1' });

    await eloCommand.execute(fake.interaction, linked(client, 'eu', ['power-1']));

    expect(client.calls[0]).toEqual(['getAccount', 'Someone', 'NA1']);
  });

  it('works for an admin who has linked nothing themselves', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      mmr: { ok: true, value: MMR },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const context = createTestContext(undefined, [], client.client);
    const fake = forOther({ manageGuild: true });

    await eloCommand.execute(fake.interaction, context);

    expect(editPayload(fake)['embeds']).toHaveLength(1);
  });

  it('rejects a malformed riot id before calling out', async () => {
    const client = healthy();
    const fake = eloInteraction({ strings: { 'riot-id': 'Someone' }, manageGuild: true });

    await eloCommand.execute(fake.interaction, linked(client));

    expect(fake.messages().join(' ')).toContain('keine gültige Riot-ID');
    expect(client.calls).toEqual([]);
  });

  it('reports a riot id riot does not know', async () => {
    const client = fakeValorantClient({
      account: { ok: false, error: { kind: 'not-found' } },
      mmr: { ok: true, value: MMR },
    });
    const fake = forOther({ manageGuild: true });

    await eloCommand.execute(fake.interaction, linked(client));

    expect(String(editPayload(fake)['content'])).toContain('Riot kennt **Someone#NA1** nicht');
  });

  it('titles the embed with the looked-up account, not the caller', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      mmr: { ok: true, value: MMR },
      mmrHistory: { ok: true, value: HISTORY },
    });
    const fake = forOther({ manageGuild: true });

    await eloCommand.execute(fake.interaction, linked(client));

    const [embed] = editPayload(fake)['embeds'] as { data: Record<string, unknown> }[];
    expect(embed?.data['title']).toBe('Someone#NA1');
  });
});
