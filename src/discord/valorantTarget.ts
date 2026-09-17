import type { ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../app/context.ts';
import { formatRiotId, parseRiotId } from '../domain/valorant/riotId.ts';
import type { Strings } from '../ui/strings.ts';
import { describeValorantError } from '../ui/valorantError.ts';
import type { ValorantClient } from '../valorant/client.ts';
import type { Affinity } from '../valorant/http.ts';
import { canUseConfig } from './permissions.ts';

/** The option every Valorant lookup command offers for naming someone else. */
export const RIOT_ID_OPTION = 'riot-id';

export interface ValorantTarget {
  readonly affinity: Affinity;
  /** Stable across renames, and what the match endpoints identify a player by. */
  readonly puuid: string;
  readonly name: string;
  readonly tag: string;
  /** `Name#Tag`, ready to put in a title. */
  readonly label: string;
}

/**
 * What a command will do, decided before anything is deferred, so every refusal
 * that needs no network call can be answered without leaving a "thinking"
 * message behind.
 */
export type TargetPlan =
  | { readonly kind: 'refuse'; readonly message: string }
  | { readonly kind: 'self'; readonly target: ValorantTarget }
  | { readonly kind: 'lookup'; readonly name: string; readonly tag: string };

const targetFrom = (name: string, tag: string, region: string, puuid: string): ValorantTarget => ({
  affinity: region as Affinity,
  puuid,
  name,
  tag,
  label: formatRiotId({ name, tag }),
});

/**
 * Reads the `riot-id` option, falling back to the caller's linked account.
 *
 * Naming someone else spends the bot's rate limit on a player who never opted
 * in, so it takes the same standing as the config commands.
 */
export const planTarget = (
  interaction: ChatInputCommandInteraction,
  context: AppContext,
  strings: Strings,
): TargetPlan => {
  const raw = interaction.options.getString(RIOT_ID_OPTION);

  if (raw === null || raw.trim() === '') {
    const account = context.riotAccounts.find(interaction.user.id);
    return account === undefined
      ? { kind: 'refuse', message: strings.riotAccountNotLinked }
      : {
          kind: 'self',
          target: targetFrom(account.riotName, account.riotTag, account.region, account.puuid),
        };
  }

  const guildId = interaction.guildId;
  const allowed =
    guildId !== null &&
    canUseConfig(interaction, context.settings.get(guildId), context.powerUserIds);

  if (!allowed) {
    return { kind: 'refuse', message: strings.valorantRiotIdAdminOnly };
  }

  const parsed = parseRiotId(raw);
  return parsed.ok
    ? { kind: 'lookup', name: parsed.value.name, tag: parsed.value.tag }
    : {
        kind: 'refuse',
        message: strings.invalidRiotId(raw.trim(), strings.riotIdProblem[parsed.error]),
      };
};

/**
 * Resolves a bare Riot ID into a target. Every downstream endpoint needs the
 * region, and the match endpoints need the puuid, neither of which a Riot ID
 * carries on its own.
 */
export const lookupTarget = async (
  client: ValorantClient,
  name: string,
  tag: string,
  strings: Strings,
): Promise<ValorantTarget | { readonly refusal: string }> => {
  const account = await client.getAccount(name, tag);

  if (!account.ok) {
    return {
      refusal:
        account.error.kind === 'not-found'
          ? strings.riotAccountNotFound(formatRiotId({ name, tag }))
          : describeValorantError(account.error, strings),
    };
  }

  return targetFrom(
    account.value.name,
    account.value.tag,
    account.value.region,
    account.value.puuid,
  );
};

/** Runs a plan to completion, doing the account lookup only when one is needed. */
export const resolveTarget = async (
  plan: Exclude<TargetPlan, { kind: 'refuse' }>,
  client: ValorantClient,
  strings: Strings,
): Promise<ValorantTarget | { readonly refusal: string }> =>
  plan.kind === 'self' ? plan.target : lookupTarget(client, plan.name, plan.tag, strings);
