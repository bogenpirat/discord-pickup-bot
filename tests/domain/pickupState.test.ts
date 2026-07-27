import { describe, expect, it } from 'vitest';
import { isPickupChoice, PICKUP_CHOICES } from '../../src/domain/pickupChoice.ts';
import {
  applyChoice,
  findResponse,
  groupByChoice,
  type ResponseSet,
  tally,
} from '../../src/domain/pickupState.ts';

const empty: ResponseSet = [];

describe('isPickupChoice', () => {
  it.each([...PICKUP_CHOICES])('accepts %s', (choice) => {
    expect(isPickupChoice(choice)).toBe(true);
  });

  it.each(['', 'maybe', 'IN', 'toString'])('rejects %s', (value) => {
    expect(isPickupChoice(value)).toBe(false);
  });
});

describe('applyChoice', () => {
  it('adds a response for a new user', () => {
    const result = applyChoice(empty, 'u1', 'in', 100);
    expect(result.change).toEqual({ kind: 'added', choice: 'in' });
    expect(result.responses).toEqual([{ userId: 'u1', choice: 'in', respondedAt: 100 }]);
  });

  it('removes the response when the same choice is clicked again', () => {
    const first = applyChoice(empty, 'u1', 'in', 100);
    const second = applyChoice(first.responses, 'u1', 'in', 200);
    expect(second.change).toEqual({ kind: 'removed', choice: 'in' });
    expect(second.responses).toEqual([]);
  });

  it('switches without duplicating when a different choice is clicked', () => {
    const first = applyChoice(empty, 'u1', 'in', 100);
    const second = applyChoice(first.responses, 'u1', 'ifMore', 200);
    expect(second.change).toEqual({ kind: 'switched', from: 'in', to: 'ifMore' });
    expect(second.responses).toEqual([{ userId: 'u1', choice: 'ifMore', respondedAt: 200 }]);
  });

  it.each(PICKUP_CHOICES.flatMap((from) => PICKUP_CHOICES.map((to) => [from, to] as const)))(
    'transitions %s to %s',
    (from, to) => {
      const start = applyChoice(empty, 'u1', from, 100);
      const next = applyChoice(start.responses, 'u1', to, 200);

      if (from === to) {
        expect(next.responses).toHaveLength(0);
        expect(next.change.kind).toBe('removed');
      } else {
        expect(next.responses).toEqual([{ userId: 'u1', choice: to, respondedAt: 200 }]);
        expect(next.change.kind).toBe('switched');
      }
    },
  );

  it('keeps users independent', () => {
    let responses: ResponseSet = empty;
    responses = applyChoice(responses, 'u1', 'in', 100).responses;
    responses = applyChoice(responses, 'u2', 'in', 110).responses;
    responses = applyChoice(responses, 'u3', 'out', 120).responses;
    responses = applyChoice(responses, 'u1', 'in', 130).responses;

    expect(tally(responses)).toEqual({ in: 1, ifMore: 0, out: 1 });
    expect(findResponse(responses, 'u1')).toBeUndefined();
    expect(findResponse(responses, 'u2')?.choice).toBe('in');
  });

  it('reports removal for a user who never responded as a no-op add', () => {
    const result = applyChoice(empty, 'ghost', 'out', 100);
    expect(result.change.kind).toBe('added');
    expect(result.responses).toHaveLength(1);
  });
});

describe('groupByChoice', () => {
  it('orders each group by response time', () => {
    const responses: ResponseSet = [
      { userId: 'late', choice: 'in', respondedAt: 300 },
      { userId: 'early', choice: 'in', respondedAt: 100 },
      { userId: 'mid', choice: 'in', respondedAt: 200 },
    ];

    expect(groupByChoice(responses).in.map((response) => response.userId)).toEqual([
      'early',
      'mid',
      'late',
    ]);
  });

  it('returns an entry for every choice even when empty', () => {
    const groups = groupByChoice(empty);
    expect(Object.keys(groups).sort()).toEqual([...PICKUP_CHOICES].sort());
    for (const choice of PICKUP_CHOICES) {
      expect(groups[choice]).toEqual([]);
    }
  });

  it('does not mutate its input', () => {
    const responses: ResponseSet = [
      { userId: 'b', choice: 'in', respondedAt: 200 },
      { userId: 'a', choice: 'in', respondedAt: 100 },
    ];
    groupByChoice(responses);
    expect(responses[0]?.userId).toBe('b');
  });
});

describe('tally', () => {
  it('counts every choice', () => {
    const responses: ResponseSet = [
      { userId: 'a', choice: 'in', respondedAt: 1 },
      { userId: 'b', choice: 'in', respondedAt: 2 },
      { userId: 'c', choice: 'ifMore', respondedAt: 3 },
    ];
    expect(tally(responses)).toEqual({ in: 2, ifMore: 1, out: 0 });
  });

  it('is all zeroes for an empty set', () => {
    expect(tally(empty)).toEqual({ in: 0, ifMore: 0, out: 0 });
  });
});
