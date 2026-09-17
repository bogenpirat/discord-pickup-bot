import { describe, expect, it } from 'vitest';
import { lastCommand, lastPrivateCommand } from '../../src/commands/last.ts';
import type { Account } from '../../src/valorant/types.ts';
import { createFakeCommandInteraction, createTestContext } from '../helpers/fakes.ts';
import { fakeValorantClient } from '../helpers/valorant.ts';

const ADMIN_ROLE = 'role-admin';

const player = (puuid: string, team: string, score: number, agent = 'Jett') => ({
  puuid,
  name: puuid.toUpperCase(),
  tag: 'EUW',
  team_id: team,
  agent: { id: 'agent-1', name: agent },
  tier: { id: 22, name: 'Immortal 2' },
  stats: {
    kills: 21,
    deaths: 14,
    assists: 6,
    score,
    headshots: 12,
    bodyshots: 30,
    legshots: 8,
    damage: { dealt: 3960, received: 3200 },
  },
});

const MATCH = {
  metadata: {
    match_id: 'match-abc',
    map: { id: 'map-1', name: 'Ascent' },
    started_at: '2026-09-01T18:00:00Z',
    game_length_in_ms: 2_400_000,
    queue: { id: 'competitive', name: 'Competitive', mode_type: 'Standard' },
  },
  players: [
    player('puuid-1', 'Red', 5720),
    player('ally-1', 'Red', 6600, 'Omen'),
    player('enemy-1', 'Blue', 4400, 'Sova'),
  ],
  teams: [
    { team_id: 'Red', won: true, rounds: { won: 13, lost: 9 } },
    { team_id: 'Blue', won: false, rounds: { won: 9, lost: 13 } },
  ],
};

const ACCOUNT: Account = {
  puuid: 'puuid-2',
  region: 'na',
  account_level: 100,
  name: 'Someone',
  tag: 'NA1',
  card: 'card',
  title: 'title',
  platforms: ['pc'],
  updated_at: '2026-09-01T18:00:00Z',
};

const withMatches = (matches: unknown) =>
  fakeValorantClient({ matches: { ok: true, value: matches as never } });

const linked = (
  client: ReturnType<typeof fakeValorantClient>,
  powerUserIds: readonly string[] = [],
) => {
  const context = createTestContext(undefined, powerUserIds, client.client);
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

const lastInteraction = (options: Parameters<typeof createFakeCommandInteraction>[0] = {}) =>
  createFakeCommandInteraction({ commandName: 'last', ...options });

const editPayload = (
  fake: ReturnType<typeof createFakeCommandInteraction>,
): Record<string, unknown> =>
  (fake.calls.filter((call) => call.method === 'editReply').at(-1)?.payload ?? {}) as Record<
    string,
    unknown
  >;

const embedOf = (fake: ReturnType<typeof createFakeCommandInteraction>) => {
  const [embed] = (editPayload(fake)['embeds'] ?? []) as { data: Record<string, unknown> }[];
  return embed?.data ?? {};
};

describe('/last', () => {
  it('refuses when no api key is configured', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, createTestContext());

    expect(fake.messages().join(' ')).toContain('VALORANT_API_KEY');
  });

  it('asks an unlinked member to link first, without calling out', async () => {
    const client = withMatches([MATCH]);
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, createTestContext(undefined, [], client.client));

    expect(fake.messages().join(' ')).toContain('noch keine Riot-ID hinterlegt');
    expect(client.calls).toEqual([]);
  });

  it('asks for exactly one match, by puuid', async () => {
    const client = withMatches([MATCH]);
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(client));

    expect(client.calls).toEqual([['getMatchesByPuuid', 'eu', 'pc', 'puuid-1', { size: 1 }]]);
  });

  it('summarises the match into an embed', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    const embed = embedOf(fake);
    expect(embed['title']).toBe('Ascent · Sieg');
    expect(String(embed['description'])).toContain('13–9');
    expect(String(embed['description'])).toContain('Competitive');
    expect(embed['url']).toBe('https://tracker.gg/valorant/match/match-abc');
  });

  it('names the account it is about', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    expect(embedOf(fake)['author']).toEqual({ name: 'Bogenpirat#EUW' });
  });

  it('reports the target own line and both scoreboards', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    const fields = embedOf(fake)['fields'] as { name: string; value: string }[];

    expect(fields[0]?.name).toContain('Jett');
    expect(fields[0]?.value).toContain('21/14/6');
    expect(fields[1]?.value).toContain('Omen');
    expect(fields[2]?.value).toContain('Sova');
  });

  it('marks the target line in its own scoreboard', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    const fields = embedOf(fake)['fields'] as { value: string }[];
    const own = (fields[1]?.value ?? '').split('\n').filter((row) => row.startsWith('>'));

    expect(own).toHaveLength(1);
    expect(own[0]).toContain('Jett');
  });

  it('says so when there is no recent match', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([])));

    expect(String(editPayload(fake)['content'])).toContain('kein letztes Match');
  });

  it('says so when the api has nothing for the account', async () => {
    const client = fakeValorantClient({ matches: { ok: false, error: { kind: 'not-found' } } });
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(client));

    expect(String(editPayload(fake)['content'])).toContain('kein letztes Match');
  });

  it('reports an api failure without pretending the match is missing', async () => {
    const client = fakeValorantClient({ matches: { ok: false, error: { kind: 'rate-limited' } } });
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(client));

    expect(String(editPayload(fake)['content'])).toContain('Limit');
  });

  // The API returned a match for this puuid, so the puuid should be in it.
  it('refuses to summarise a match the player is not in', async () => {
    const foreign = { ...MATCH, players: [player('someone-else', 'Red', 5000)] };
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([foreign])));

    expect(String(editPayload(fake)['content'])).toContain('kein letztes Match');
  });

  it('refuses outside a guild', async () => {
    const fake = lastInteraction({ guildId: null });

    await lastCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    expect(fake.messages().join(' ')).toContain('nur auf einem Server');
  });
});

describe('/last visibility', () => {
  it('defers publicly by default', async () => {
    const fake = lastInteraction();

    await lastCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    const defer = fake.calls.find((call) => call.method === 'deferReply');
    expect(defer?.payload).toEqual({});
  });

  it('defers ephemerally for the private variant', async () => {
    const fake = lastInteraction({ commandName: 'last-private' });

    await lastPrivateCommand.execute(fake.interaction, linked(withMatches([MATCH])));

    const defer = fake.calls.find((call) => call.method === 'deferReply');
    expect(defer?.payload).toEqual({ flags: 64 });
  });

  it('produces the same summary either way', async () => {
    const open = lastInteraction();
    const quiet = lastInteraction({ commandName: 'last-private' });

    await lastCommand.execute(open.interaction, linked(withMatches([MATCH])));
    await lastPrivateCommand.execute(quiet.interaction, linked(withMatches([MATCH])));

    expect(embedOf(quiet)).toEqual(embedOf(open));
  });
});

describe('/last for another riot id', () => {
  const forOther = (options: Parameters<typeof createFakeCommandInteraction>[0] = {}) =>
    lastInteraction({ strings: { 'riot-id': 'Someone#NA1' }, ...options });

  it('refuses a plain member and spends nothing', async () => {
    const client = withMatches([MATCH]);
    const fake = forOther();

    await lastCommand.execute(fake.interaction, linked(client));

    expect(fake.messages().join(' ')).toContain('Config-Befehle');
    expect(client.calls).toEqual([]);
  });

  it('resolves the account first, then its last match', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      matches: { ok: true, value: [MATCH] as never },
    });
    const fake = forOther({ manageGuild: true });

    await lastCommand.execute(fake.interaction, linked(client));

    expect(client.calls).toEqual([
      ['getAccount', 'Someone', 'NA1'],
      ['getMatchesByPuuid', 'na', 'pc', 'puuid-2', { size: 1 }],
    ]);
  });

  it('allows the configured admin role', async () => {
    const client = fakeValorantClient({
      account: { ok: true, value: ACCOUNT },
      matches: { ok: true, value: [MATCH] as never },
    });
    const context = linked(client);
    context.settings.setConfigRole('guild-1', ADMIN_ROLE);
    const fake = forOther({ roleIds: [ADMIN_ROLE] });

    await lastCommand.execute(fake.interaction, context);

    expect(client.calls[0]).toEqual(['getAccount', 'Someone', 'NA1']);
  });

  it('rejects a malformed riot id before calling out', async () => {
    const client = withMatches([MATCH]);
    const fake = lastInteraction({ strings: { 'riot-id': 'Someone' }, manageGuild: true });

    await lastCommand.execute(fake.interaction, linked(client));

    expect(fake.messages().join(' ')).toContain('keine gültige Riot-ID');
    expect(client.calls).toEqual([]);
  });
});
