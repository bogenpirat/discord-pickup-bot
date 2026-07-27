import type { DatabaseSync } from 'node:sqlite';
import { isPickupChoice, type PickupChoice } from '../../domain/pickupChoice.ts';
import type { PickupResponse, ResponseSet } from '../../domain/pickupState.ts';
import { asNumber, asText, type SqlRow } from '../rows.ts';

export interface ResponseRepository {
  listByPickup(pickupId: number): ResponseSet;
  set(pickupId: number, userId: string, choice: PickupChoice, respondedAt: number): void;
  remove(pickupId: number, userId: string): void;
}

const toResponse = (row: SqlRow): PickupResponse | undefined => {
  const choice = asText(row['choice']);
  if (!isPickupChoice(choice)) {
    return undefined;
  }
  return {
    userId: asText(row['user_id']),
    choice,
    respondedAt: asNumber(row['responded_at']),
  };
};

export const createResponseRepository = (db: DatabaseSync): ResponseRepository => {
  const listStatement = db.prepare(
    'SELECT * FROM pickup_responses WHERE pickup_id = ? ORDER BY responded_at ASC',
  );
  const setStatement = db.prepare(
    `INSERT INTO pickup_responses (pickup_id, user_id, choice, responded_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (pickup_id, user_id)
     DO UPDATE SET choice = excluded.choice, responded_at = excluded.responded_at`,
  );
  const removeStatement = db.prepare(
    'DELETE FROM pickup_responses WHERE pickup_id = ? AND user_id = ?',
  );

  return {
    listByPickup: (pickupId) =>
      listStatement
        .all(pickupId)
        .map((row) => toResponse(row as SqlRow))
        .filter((response): response is PickupResponse => response !== undefined),
    set: (pickupId, userId, choice, respondedAt) => {
      setStatement.run(pickupId, userId, choice, respondedAt);
    },
    remove: (pickupId, userId) => {
      removeStatement.run(pickupId, userId);
    },
  };
};
