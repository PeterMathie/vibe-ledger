import type { Classification } from '../domain/types';
import type { Database } from './database';

export async function saveManualClassification(
  database: Database,
  classification: Classification,
): Promise<void> {
  if (
    classification.classificationSource !== 'MANUAL' ||
    classification.confidence !== 'MANUAL'
  ) {
    throw new Error(
      'Manual classifications must use MANUAL source and confidence.',
    );
  }

  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await database.runAsync(
      `UPDATE transaction_classifications
       SET active = 0, updated_at = ?
       WHERE raw_transaction_id = ? AND active = 1;`,
      classification.updatedAt,
      classification.rawTransactionId,
    );
    await database.runAsync(
      `INSERT INTO transaction_classifications (
        id, raw_transaction_id, event_type, budget_scope, category_id,
        classification_source, confidence, counts_toward_budget_base,
        offset_raw_transaction_id, note, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'MANUAL', 'MANUAL', ?, ?, ?, 1, ?, ?);`,
      classification.id,
      classification.rawTransactionId,
      classification.eventType,
      classification.budgetScope,
      classification.categoryId,
      classification.countsTowardBudgetBase ? 1 : 0,
      classification.offsetRawTransactionId,
      classification.note,
      classification.createdAt,
      classification.updatedAt,
    );
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}
