import type { DatabaseSync } from 'node:sqlite';
import { asNumber, asText, type SqlRow } from '../rows.ts';

export interface RiotAccount {
  readonly discordUserId: string;
  /** Stable across Riot ID changes, so everything downstream keys on this. */
  readonly puuid: string;
  readonly riotName: string;
  readonly riotTag: string;
  readonly region: string;
  readonly linkedAt: number;
  readonly refreshedAt: number;
}

export type RiotAccountInput = Omit<RiotAccount, 'linkedAt' | 'refreshedAt'>;

export interface RiotAccountRepository {
  find(discordUserId: string): RiotAccount | undefined;
  /** Lets a caller report "already linked by someone else" instead of hitting the unique index. */
  findByPuuid(puuid: string): RiotAccount | undefined;
  link(account: RiotAccountInput, now: number): void;
  /** Writes back a name or region that changed since the account was linked. */
  refreshIdentity(
    puuid: string,
    riotName: string,
    riotTag: string,
    region: string,
    now: number,
  ): void;
  unlink(discordUserId: string): boolean;
  listAll(): readonly RiotAccount[];
}

const toAccount = (row: SqlRow): RiotAccount => ({
  discordUserId: asText(row['discord_user_id']),
  puuid: asText(row['puuid']),
  riotName: asText(row['riot_name']),
  riotTag: asText(row['riot_tag']),
  region: asText(row['region']),
  linkedAt: asNumber(row['linked_at']),
  refreshedAt: asNumber(row['refreshed_at']),
});

export const createRiotAccountRepository = (db: DatabaseSync): RiotAccountRepository => {
  const selectByUser = db.prepare('SELECT * FROM riot_accounts WHERE discord_user_id = ?');
  const selectByPuuid = db.prepare('SELECT * FROM riot_accounts WHERE puuid = ?');
  const selectAll = db.prepare('SELECT * FROM riot_accounts ORDER BY linked_at ASC');
  const deleteByUser = db.prepare('DELETE FROM riot_accounts WHERE discord_user_id = ?');

  // Relinking keeps the original linked_at: it records when this person first
  // handed us a Riot ID, which stays true when they later correct or rename it.
  const upsert = db.prepare(
    `INSERT INTO riot_accounts
       (discord_user_id, puuid, riot_name, riot_tag, region, linked_at, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (discord_user_id) DO UPDATE SET
       puuid = excluded.puuid,
       riot_name = excluded.riot_name,
       riot_tag = excluded.riot_tag,
       region = excluded.region,
       refreshed_at = excluded.refreshed_at`,
  );

  const updateIdentity = db.prepare(
    `UPDATE riot_accounts
     SET riot_name = ?, riot_tag = ?, region = ?, refreshed_at = ?
     WHERE puuid = ?`,
  );

  return {
    find: (discordUserId) => {
      const row = selectByUser.get(discordUserId);
      return row === undefined ? undefined : toAccount(row as SqlRow);
    },

    findByPuuid: (puuid) => {
      const row = selectByPuuid.get(puuid);
      return row === undefined ? undefined : toAccount(row as SqlRow);
    },

    link: (account, now) => {
      upsert.run(
        account.discordUserId,
        account.puuid,
        account.riotName,
        account.riotTag,
        account.region,
        now,
        now,
      );
    },

    refreshIdentity: (puuid, riotName, riotTag, region, now) => {
      updateIdentity.run(riotName, riotTag, region, now, puuid);
    },

    unlink: (discordUserId) => deleteByUser.run(discordUserId).changes > 0,

    listAll: () => selectAll.all().map((row) => toAccount(row as SqlRow)),
  };
};
