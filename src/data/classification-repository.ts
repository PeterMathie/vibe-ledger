import { validateSplits } from '../domain/classification';
import { DomainValidationError } from '../domain/errors';
import {
  BUDGET_SCOPES,
  EVENT_TYPES,
  parseEnumValue,
  type BudgetScope,
  type EventType,
} from '../domain/enums';
import type {
  Category,
  Classification,
  ClassificationRule,
  RawTransaction,
  TransactionSplit,
} from '../domain/types';
import type { Database } from './database';

export interface TransactionCorrection {
  readonly changeId: string;
  readonly classificationId: string;
  readonly rawTransactionId: string;
  readonly eventType: EventType;
  readonly budgetScope: BudgetScope;
  readonly categoryId: string | null;
  readonly countsTowardBudgetBase: boolean;
  readonly note: string | null;
  readonly splits: readonly {
    readonly id: string;
    readonly amountMinorAbs: number;
    readonly eventType: EventType;
    readonly budgetScope: BudgetScope;
    readonly categoryId: string | null;
    readonly note: string | null;
  }[];
  readonly timestamp: string;
}

export interface MerchantRuleDraft {
  readonly id: string;
  readonly priority: number;
  readonly matchValue: string;
  readonly resultEventType: EventType;
  readonly resultCategoryId: string | null;
  readonly resultBudgetScope: BudgetScope | null;
  readonly timestamp: string;
}

interface StoredChange {
  readonly id: string;
  readonly before_json: string;
}

interface ClassificationRow {
  readonly id: string;
  readonly raw_transaction_id: string;
  readonly event_type: EventType;
  readonly budget_scope: BudgetScope;
  readonly category_id: string | null;
  readonly classification_source: Classification['classificationSource'];
  readonly confidence: Classification['confidence'];
  readonly counts_toward_budget_base: number;
  readonly offset_raw_transaction_id: string | null;
  readonly note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface SplitRow {
  readonly id: string;
  readonly raw_transaction_id: string;
  readonly amount_minor_abs: number;
  readonly event_type: EventType;
  readonly budget_scope: BudgetScope;
  readonly category_id: string | null;
  readonly classification_source: TransactionSplit['classificationSource'];
  readonly note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ClassificationSnapshot {
  readonly classification: ClassificationRow;
  readonly splits: readonly SplitRow[];
}

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

export async function saveTransactionCorrection(
  database: Database,
  correction: TransactionCorrection,
): Promise<void> {
  assertTimestamp(correction.timestamp);
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    const before = await loadClassificationSnapshot(
      database,
      correction.rawTransactionId,
    );
    const raw = await loadRawTransaction(database, correction.rawTransactionId);
    await assertCategoryIds(
      database,
      [
        correction.categoryId,
        ...correction.splits.map(({ categoryId }) => categoryId),
      ].filter((value): value is string => value !== null),
    );
    const splits = correction.splits.map<TransactionSplit>((split) => ({
      ...split,
      rawTransactionId: correction.rawTransactionId,
      classificationSource: 'MANUAL',
      createdAt: correction.timestamp,
      updatedAt: correction.timestamp,
    }));
    if (splits.length > 0) {
      validateSplits(raw, splits);
    }
    const classification: Classification = {
      id: correction.classificationId,
      rawTransactionId: correction.rawTransactionId,
      eventType: correction.eventType,
      budgetScope: correction.budgetScope,
      categoryId: correction.categoryId,
      classificationSource: 'MANUAL',
      confidence: 'MANUAL',
      countsTowardBudgetBase: correction.countsTowardBudgetBase,
      offsetRawTransactionId: before.classification.offset_raw_transaction_id,
      note: normalizeNote(correction.note),
      createdAt: correction.timestamp,
      updatedAt: correction.timestamp,
    };
    const after = snapshotFromDomain(classification, splits);
    await replaceClassification(database, classification, splits);
    await database.runAsync(
      `INSERT INTO classification_changes (
        id, raw_transaction_id, before_json, after_json, created_at
      ) VALUES (?, ?, ?, ?, ?);`,
      correction.changeId,
      correction.rawTransactionId,
      JSON.stringify(before),
      JSON.stringify(after),
      correction.timestamp,
    );
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function undoLatestClassificationChange(
  database: Database,
  rawTransactionId: string,
  timestamp: string,
): Promise<boolean> {
  assertTimestamp(timestamp);
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    const change = await database.getFirstAsync<StoredChange>(
      `SELECT id, before_json
       FROM classification_changes
       WHERE raw_transaction_id = ? AND undone_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1;`,
      rawTransactionId,
    );
    if (change === null) {
      await database.execAsync('COMMIT;');
      return false;
    }
    const before = parseSnapshot(change.before_json);
    await database.runAsync(
      `UPDATE transaction_classifications
       SET active = 0, updated_at = ?
       WHERE raw_transaction_id = ? AND active = 1;`,
      timestamp,
      rawTransactionId,
    );
    const restored = await database.runAsync(
      `UPDATE transaction_classifications
       SET active = 1
       WHERE id = ? AND raw_transaction_id = ?;`,
      before.classification.id,
      rawTransactionId,
    );
    if (restored.changes !== 1) {
      throw new DomainValidationError(
        'The previous classification is unavailable.',
      );
    }
    await replaceSplits(database, rawTransactionId, before.splits);
    await database.runAsync(
      `UPDATE classification_changes
       SET undone_at = ?
       WHERE id = ? AND undone_at IS NULL;`,
      timestamp,
      change.id,
    );
    await database.execAsync('COMMIT;');
    return true;
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function listCategories(
  database: Database,
): Promise<readonly Category[]> {
  return database.getAllAsync<Category>(
    `SELECT category.id, category.name, super.key AS superCategory,
      category.default_budget_scope AS defaultBudgetScope
     FROM categories category
     JOIN super_categories super ON super.id = category.super_category_id
     WHERE category.active = 1
     ORDER BY super.sort_order, category.sort_order, category.name;`,
  );
}

export async function createMerchantRule(
  database: Database,
  draft: MerchantRuleDraft,
): Promise<void> {
  assertRuleDraft(draft);
  await assertCategoryIds(
    database,
    draft.resultCategoryId === null ? [] : [draft.resultCategoryId],
  );
  await database.runAsync(
    `INSERT INTO classification_rules (
      id, priority, enabled, match_type, match_value, result_event_type,
      result_category_id, result_budget_scope, created_at, updated_at
    ) VALUES (?, ?, 1, 'merchant_name', ?, ?, ?, ?, ?, ?);`,
    draft.id,
    draft.priority,
    draft.matchValue.trim(),
    draft.resultEventType,
    draft.resultCategoryId,
    draft.resultBudgetScope,
    draft.timestamp,
    draft.timestamp,
  );
}

export async function updateMerchantRule(
  database: Database,
  ruleId: string,
  draft: Omit<MerchantRuleDraft, 'id'>,
): Promise<void> {
  assertRuleDraft({ ...draft, id: ruleId });
  await assertCategoryIds(
    database,
    draft.resultCategoryId === null ? [] : [draft.resultCategoryId],
  );
  const result = await database.runAsync(
    `UPDATE classification_rules
     SET priority = ?, match_value = ?, result_event_type = ?,
       result_category_id = ?, result_budget_scope = ?, created_at = ?,
       updated_at = ?
     WHERE id = ? AND match_type = 'merchant_name';`,
    draft.priority,
    draft.matchValue.trim(),
    draft.resultEventType,
    draft.resultCategoryId,
    draft.resultBudgetScope,
    draft.timestamp,
    draft.timestamp,
    ruleId,
  );
  if (result.changes !== 1) {
    throw new DomainValidationError('Merchant rule was not found.');
  }
}

export async function setMerchantRuleEnabled(
  database: Database,
  ruleId: string,
  enabled: boolean,
  timestamp: string,
): Promise<void> {
  assertTimestamp(timestamp);
  const result = await database.runAsync(
    `UPDATE classification_rules
     SET enabled = ?, updated_at = ?
     WHERE id = ? AND match_type = 'merchant_name';`,
    enabled ? 1 : 0,
    timestamp,
    ruleId,
  );
  if (result.changes !== 1) {
    throw new DomainValidationError('Merchant rule was not found.');
  }
}

export async function listMerchantRules(
  database: Database,
): Promise<readonly ClassificationRule[]> {
  const rows = await database.getAllAsync<{
    id: string;
    priority: number;
    enabled: number;
    match_value: string;
    result_event_type: EventType;
    result_category_id: string | null;
    result_budget_scope: BudgetScope | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, priority, enabled, match_value, result_event_type,
      result_category_id, result_budget_scope, created_at, updated_at
     FROM classification_rules
     WHERE match_type = 'merchant_name'
     ORDER BY priority DESC, created_at, id;`,
  );
  return rows.map((row) => ({
    id: row.id,
    priority: row.priority,
    enabled: row.enabled === 1,
    matchType: 'merchant_name',
    matchValue: row.match_value,
    resultEventType: row.result_event_type,
    resultCategoryId: row.result_category_id,
    resultBudgetScope: row.result_budget_scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function applyFutureMerchantRule(
  database: Database,
  rawTransactionId: string,
  classificationId: string,
  timestamp: string,
): Promise<'APPLIED' | 'MANUAL_PROTECTED' | 'NO_MATCH'> {
  assertTimestamp(timestamp);
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    const active = await database.getFirstAsync<ClassificationRow>(
      `SELECT id, raw_transaction_id, event_type, budget_scope, category_id,
        classification_source, confidence, counts_toward_budget_base,
        offset_raw_transaction_id, note, created_at, updated_at
       FROM transaction_classifications
       WHERE raw_transaction_id = ? AND active = 1;`,
      rawTransactionId,
    );
    if (active?.classification_source === 'MANUAL') {
      await database.execAsync('COMMIT;');
      return 'MANUAL_PROTECTED';
    }
    const match = await database.getFirstAsync<{
      result_event_type: EventType;
      result_category_id: string | null;
      result_budget_scope: BudgetScope | null;
    }>(
      `SELECT rule.result_event_type, rule.result_category_id,
        rule.result_budget_scope
       FROM raw_transactions raw
       JOIN classification_rules rule
         ON rule.enabled = 1
        AND rule.match_type = 'merchant_name'
        AND lower(rule.match_value) =
          lower(COALESCE(raw.merchant_name, raw.description))
        AND rule.created_at <= raw.first_seen_at
       WHERE raw.id = ?
       ORDER BY rule.priority DESC, rule.created_at DESC, rule.id
       LIMIT 1;`,
      rawTransactionId,
    );
    if (match === null) {
      await database.execAsync('COMMIT;');
      return 'NO_MATCH';
    }
    const classification: Classification = {
      id: classificationId,
      rawTransactionId,
      eventType: match.result_event_type,
      budgetScope:
        match.result_budget_scope ?? active?.budget_scope ?? 'INCLUDED',
      categoryId: match.result_category_id,
      classificationSource: 'RULE',
      confidence: 'HIGH',
      countsTowardBudgetBase: match.result_event_type === 'INCOME',
      offsetRawTransactionId: null,
      note: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await database.runAsync(
      `UPDATE transaction_classifications
       SET active = 0, updated_at = ?
       WHERE raw_transaction_id = ? AND active = 1;`,
      classification.updatedAt,
      classification.rawTransactionId,
    );
    await insertClassification(database, classification);
    await database.execAsync('COMMIT;');
    return 'APPLIED';
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

async function replaceClassification(
  database: Database,
  classification: Classification,
  splits: readonly TransactionSplit[],
): Promise<void> {
  await database.runAsync(
    `UPDATE transaction_classifications
     SET active = 0, updated_at = ?
     WHERE raw_transaction_id = ? AND active = 1;`,
    classification.updatedAt,
    classification.rawTransactionId,
  );
  await insertClassification(database, classification);
  await replaceSplits(
    database,
    classification.rawTransactionId,
    splits.map(splitToRow),
  );
}

async function insertClassification(
  database: Database,
  classification: Classification,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO transaction_classifications (
      id, raw_transaction_id, event_type, budget_scope, category_id,
      classification_source, confidence, counts_toward_budget_base,
      offset_raw_transaction_id, note, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
    classification.id,
    classification.rawTransactionId,
    classification.eventType,
    classification.budgetScope,
    classification.categoryId,
    classification.classificationSource,
    classification.confidence,
    classification.countsTowardBudgetBase ? 1 : 0,
    classification.offsetRawTransactionId,
    classification.note,
    classification.createdAt,
    classification.updatedAt,
  );
}

async function replaceSplits(
  database: Database,
  rawTransactionId: string,
  splits: readonly SplitRow[],
): Promise<void> {
  await database.runAsync(
    'DELETE FROM transaction_splits WHERE raw_transaction_id = ?;',
    rawTransactionId,
  );
  for (const split of splits) {
    await database.runAsync(
      `INSERT INTO transaction_splits (
        id, raw_transaction_id, amount_minor_abs, event_type, budget_scope,
        category_id, classification_source, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      split.id,
      split.raw_transaction_id,
      split.amount_minor_abs,
      split.event_type,
      split.budget_scope,
      split.category_id,
      split.classification_source,
      split.note,
      split.created_at,
      split.updated_at,
    );
  }
}

async function loadClassificationSnapshot(
  database: Database,
  rawTransactionId: string,
): Promise<ClassificationSnapshot> {
  const classification = await database.getFirstAsync<ClassificationRow>(
    `SELECT id, raw_transaction_id, event_type, budget_scope, category_id,
      classification_source, confidence, counts_toward_budget_base,
      offset_raw_transaction_id, note, created_at, updated_at
     FROM transaction_classifications
     WHERE raw_transaction_id = ? AND active = 1;`,
    rawTransactionId,
  );
  if (classification === null) {
    throw new DomainValidationError(
      'Transaction classification was not found.',
    );
  }
  const splits = await database.getAllAsync<SplitRow>(
    `SELECT id, raw_transaction_id, amount_minor_abs, event_type, budget_scope,
      category_id, classification_source, note, created_at, updated_at
     FROM transaction_splits
     WHERE raw_transaction_id = ?
     ORDER BY rowid;`,
    rawTransactionId,
  );
  return { classification, splits };
}

async function loadRawTransaction(
  database: Database,
  rawTransactionId: string,
): Promise<RawTransaction> {
  const row = await database.getFirstAsync<{
    id: string;
    source: string;
    source_transaction_id: string;
    source_account_id: string | null;
    amount_minor: number;
    currency: string;
    description: string;
    merchant_id: string | null;
    merchant_name: string | null;
    source_category: string | null;
    created_at: string;
    settled_at: string | null;
    raw_payload_json: string;
    first_seen_at: string;
    last_synced_at: string;
    source_deleted: number;
  }>('SELECT * FROM raw_transactions WHERE id = ?;', rawTransactionId);
  if (row === null) {
    throw new DomainValidationError('Transaction was not found.');
  }
  return {
    id: row.id,
    source: row.source,
    sourceTransactionId: row.source_transaction_id,
    sourceAccountId: row.source_account_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    description: row.description,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    sourceCategory: row.source_category,
    createdAt: row.created_at,
    settledAt: row.settled_at,
    rawPayloadJson: row.raw_payload_json,
    firstSeenAt: row.first_seen_at,
    lastSyncedAt: row.last_synced_at,
    sourceDeleted: row.source_deleted === 1,
  };
}

async function assertCategoryIds(
  database: Database,
  categoryIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(categoryIds)];
  if (unique.length === 0) {
    return;
  }
  const placeholders = unique.map(() => '?').join(', ');
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT count(*) AS count FROM categories
     WHERE active = 1 AND id IN (${placeholders});`,
    ...unique,
  );
  if (row?.count !== unique.length) {
    throw new DomainValidationError('A selected category is unavailable.');
  }
}

function assertRuleDraft(draft: MerchantRuleDraft): void {
  assertTimestamp(draft.timestamp);
  parseEnumValue(EVENT_TYPES, draft.resultEventType, 'event type');
  if (draft.resultBudgetScope !== null) {
    parseEnumValue(BUDGET_SCOPES, draft.resultBudgetScope, 'budget scope');
  }
  if (
    !Number.isSafeInteger(draft.priority) ||
    draft.matchValue.trim().length === 0
  ) {
    throw new DomainValidationError('Merchant rule values are invalid.');
  }
}

function normalizeNote(note: string | null): string | null {
  const normalized = note?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new DomainValidationError('A valid audit timestamp is required.');
  }
}

function snapshotFromDomain(
  classification: Classification,
  splits: readonly TransactionSplit[],
): ClassificationSnapshot {
  return {
    classification: {
      id: classification.id,
      raw_transaction_id: classification.rawTransactionId,
      event_type: classification.eventType,
      budget_scope: classification.budgetScope,
      category_id: classification.categoryId,
      classification_source: classification.classificationSource,
      confidence: classification.confidence,
      counts_toward_budget_base: classification.countsTowardBudgetBase ? 1 : 0,
      offset_raw_transaction_id: classification.offsetRawTransactionId,
      note: classification.note,
      created_at: classification.createdAt,
      updated_at: classification.updatedAt,
    },
    splits: splits.map(splitToRow),
  };
}

function splitToRow(split: TransactionSplit): SplitRow {
  return {
    id: split.id,
    raw_transaction_id: split.rawTransactionId,
    amount_minor_abs: split.amountMinorAbs,
    event_type: split.eventType,
    budget_scope: split.budgetScope,
    category_id: split.categoryId,
    classification_source: split.classificationSource,
    note: split.note,
    created_at: split.createdAt,
    updated_at: split.updatedAt,
  };
}

function parseSnapshot(value: string): ClassificationSnapshot {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('classification' in parsed) ||
    !('splits' in parsed) ||
    !Array.isArray(parsed.splits)
  ) {
    throw new DomainValidationError('Classification history is invalid.');
  }
  return parsed as ClassificationSnapshot;
}
