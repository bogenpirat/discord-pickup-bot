import { PICKUP_CHOICES, type PickupChoice } from './pickupChoice.ts';

export interface PickupResponse {
  readonly userId: string;
  readonly choice: PickupChoice;
  readonly respondedAt: number;
}

export type ResponseSet = readonly PickupResponse[];

export type ResponseChange =
  | { readonly kind: 'added'; readonly choice: PickupChoice }
  | { readonly kind: 'switched'; readonly from: PickupChoice; readonly to: PickupChoice }
  | { readonly kind: 'removed'; readonly choice: PickupChoice };

export interface AppliedChoice {
  readonly responses: ResponseSet;
  readonly change: ResponseChange;
}

export const findResponse = (responses: ResponseSet, userId: string): PickupResponse | undefined =>
  responses.find((response) => response.userId === userId);

export const applyChoice = (
  responses: ResponseSet,
  userId: string,
  choice: PickupChoice,
  respondedAt: number,
): AppliedChoice => {
  const existing = findResponse(responses, userId);
  const without = responses.filter((response) => response.userId !== userId);

  if (existing === undefined) {
    return {
      responses: [...without, { userId, choice, respondedAt }],
      change: { kind: 'added', choice },
    };
  }

  if (existing.choice === choice) {
    return { responses: without, change: { kind: 'removed', choice } };
  }

  return {
    responses: [...without, { userId, choice, respondedAt }],
    change: { kind: 'switched', from: existing.choice, to: choice },
  };
};

export type ResponseGroups = Readonly<Record<PickupChoice, ResponseSet>>;

export const groupByChoice = (responses: ResponseSet): ResponseGroups => {
  const ordered = [...responses].sort((a, b) => a.respondedAt - b.respondedAt);
  const groups = {} as Record<PickupChoice, PickupResponse[]>;

  for (const choice of PICKUP_CHOICES) {
    groups[choice] = [];
  }
  for (const response of ordered) {
    groups[response.choice].push(response);
  }

  return groups;
};

export type Tally = Readonly<Record<PickupChoice, number>>;

export const tally = (responses: ResponseSet): Tally => {
  const groups = groupByChoice(responses);
  const counts = {} as Record<PickupChoice, number>;

  for (const choice of PICKUP_CHOICES) {
    counts[choice] = groups[choice].length;
  }

  return counts;
};
