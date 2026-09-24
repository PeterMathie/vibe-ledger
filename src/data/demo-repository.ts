import {
  calculateMonthlyBudget,
  createMonthlyBudget,
  type AllocationRatios,
  type MonthlyBudgetSummary,
} from '../domain/budget';
import { DomainValidationError } from '../domain/errors';
import type { LedgerQuery } from '../domain/query';
import type {
  Category,
  Classification,
  ClassifiedTransaction,
  MonthlyBudget,
  RawTransaction,
  TransactionSplit,
} from '../domain/types';
import {
  DEMO_BUDGETS,
  DEMO_CLOCK,
  DEMO_DATASET_ID,
  DEMO_FIXTURE_VERSION,
  DEMO_TRANSACTIONS,
} from '../demo/fixtures';
import type { Database, DatabaseValue } from './database';

export interface DemoImportResult {
  readonly insertedTransactions: number;
  readonly insertedBudgets: number;
  readonly unchangedTransactions: number;
}

export interface LedgerMonth {
  readonly budget: MonthlyBudget;
  readonly summary: MonthlyBudgetSummary;
  readonly transactions: readonly ClassifiedTransaction[];
  readonly resolutionTransactions: readonly ClassifiedTransaction[];
}

export interface LedgerSnapshot {
  readonly isDemoLoaded: boolean;
  readonly months: readonly string[];
  readonly activeMonth: string | null;
  readonly ledgerMonth: LedgerMonth | null;
}

export interface LedgerQueryResult {
  readonly matches: readonly ClassifiedTransaction[];
  readonly resolutionTransactions: readonly ClassifiedTransaction[];
}

interface JoinedTransactionRow {
  readonly raw_id: string;
  readonly source: string;
  readonly source_transaction_id: string;
  readonly source_account_id: string | null;
  readonly amount_minor: number;
  readonly currency: string;
  readonly description: string;
  readonly merchant_id: string | null;
  readonly merchant_name: string | null;
  readonly source_category: string | null;
  readonly raw_created_at: string;
  readonly settled_at: string | null;
  readonly raw_payload_json: string;
  readonly first_seen_at: string;
  readonly last_synced_at: string;
  readonly source_deleted: number;
  readonly classification_id: string;
  readonly event_type: Classification['eventType'];
  readonly budget_scope: Classification['budgetScope'];
  readonly category_id: string | null;
  readonly classification_source: Classification['classificationSource'];
  readonly confidence: Classification['confidence'];
  readonly counts_toward_budget_base: number;
  readonly offset_raw_transaction_id: string | null;
  readonly note: string | null;
  readonly classification_created_at: string;
  readonly classification_updated_at: string;
  readonly category_name: string | null;
  readonly super_category_key: Category['superCategory'] | null;
  readonly default_budget_scope: Category['defaultBudgetScope'] | null;
}

interface SplitRow {
  readonly id: string;
  readonly raw_transaction_id: string;
  readonly amount_minor_abs: number;
  readonly event_type: TransactionSplit['eventType'];
  readonly budget_scope: TransactionSplit['budgetScope'];
  readonly category_id: string | null;
  readonly classification_source: TransactionSplit['classificationSource'];
  readonly note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly super_category: Category['superCategory'];
  readonly default_budget_scope: Category['defaultBudgetScope'];
}

interface MonthlyBudgetRow {
  readonly month_key: string;
  readonly currency: string;
  readonly budget_base_minor: number;
  readonly budget_base_mode: MonthlyBudget['budgetBaseMode'];
  readonly living_ratio_bp: number;
  readonly saving_ratio_bp: number;
  readonly fun_ratio_bp: number;
  readonly living_target_minor: number;
  readonly saving_target_minor: number;
  readonly fun_target_minor: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
}

export async function importDemoData(
  database: Database,
): Promise<DemoImportResult> {
  let insertedTransactions = 0;
  let insertedBudgets = 0;

  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    for (const budget of DEMO_BUDGETS) {
      const result = await database.runAsync(
        `INSERT INTO monthly_budgets (
          month_key, currency, budget_base_minor, budget_base_mode,
          living_ratio_bp, saving_ratio_bp, fun_ratio_bp,
          living_target_minor, saving_target_minor, fun_target_minor,
          created_at, updated_at, closed_at
        ) VALUES (?, ?, ?, 'AUTO', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(month_key) DO NOTHING;`,
        budget.monthKey,
        budget.currency,
        budget.budgetBaseMinor,
        budget.livingRatioBp,
        budget.savingRatioBp,
        budget.funRatioBp,
        budget.livingTargetMinor,
        budget.savingTargetMinor,
        budget.funTargetMinor,
        DEMO_CLOCK,
        DEMO_CLOCK,
        budget.closedAt,
      );
      if (result.changes === 1) {
        insertedBudgets += 1;
        await ownRecord(database, 'MONTHLY_BUDGET', budget.monthKey);
      }
    }

    for (const fixture of DEMO_TRANSACTIONS) {
      const rawId = demoRawId(fixture.id);
      const result = await database.runAsync(
        `INSERT INTO raw_transactions (
          id, source, source_transaction_id, source_account_id, amount_minor,
          currency, description, merchant_id, merchant_name, source_category,
          created_at, settled_at, raw_payload_json, first_seen_at,
          last_synced_at, source_deleted
        ) VALUES (?, 'demo', ?, NULL, ?, 'GBP', ?, NULL, ?, NULL, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(source, source_transaction_id) DO NOTHING;`,
        rawId,
        fixture.id,
        fixture.amountMinor,
        fixture.description,
        fixture.merchantName,
        fixture.createdAt,
        fixture.createdAt,
        JSON.stringify({ synthetic: true, fixtureId: fixture.id }),
        DEMO_CLOCK,
        DEMO_CLOCK,
      );
      if (result.changes !== 1) {
        continue;
      }

      insertedTransactions += 1;
      await ownRecord(database, 'RAW_TRANSACTION', rawId);
      await database.runAsync(
        `INSERT INTO transaction_classifications (
          id, raw_transaction_id, event_type, budget_scope, category_id,
          classification_source, confidence, counts_toward_budget_base,
          offset_raw_transaction_id, note, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
        `demo-classification:${fixture.id}`,
        rawId,
        fixture.eventType,
        fixture.budgetScope,
        fixture.categoryId,
        fixture.classificationSource,
        fixture.confidence,
        fixture.countsTowardBudgetBase ? 1 : 0,
        fixture.offsetId === null ? null : demoRawId(fixture.offsetId),
        fixture.note,
        DEMO_CLOCK,
        DEMO_CLOCK,
      );

      for (const split of fixture.splits ?? []) {
        await database.runAsync(
          `INSERT INTO transaction_splits (
            id, raw_transaction_id, amount_minor_abs, event_type, budget_scope,
            category_id, classification_source, note, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'IMPORT_HINT', NULL, ?, ?);`,
          split.id,
          rawId,
          split.amountMinorAbs,
          split.eventType,
          split.budgetScope,
          split.categoryId,
          DEMO_CLOCK,
          DEMO_CLOCK,
        );
      }
    }

    await database.runAsync(
      `INSERT INTO demo_dataset_state (dataset_id, fixture_version, loaded_at)
       VALUES (?, ?, ?)
       ON CONFLICT(dataset_id) DO UPDATE SET
         fixture_version = excluded.fixture_version,
         loaded_at = excluded.loaded_at;`,
      DEMO_DATASET_ID,
      DEMO_FIXTURE_VERSION,
      DEMO_CLOCK,
    );
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }

  return {
    insertedTransactions,
    insertedBudgets,
    unchangedTransactions: DEMO_TRANSACTIONS.length - insertedTransactions,
  };
}

export async function resetDemoData(database: Database): Promise<void> {
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await database.execAsync(`
      DELETE FROM transaction_splits
      WHERE raw_transaction_id IN (
        SELECT record_id FROM demo_dataset_records
        WHERE record_type = 'RAW_TRANSACTION'
      );
      DELETE FROM transaction_classifications
      WHERE raw_transaction_id IN (
        SELECT record_id FROM demo_dataset_records
        WHERE record_type = 'RAW_TRANSACTION'
      );
      DELETE FROM raw_transactions
      WHERE id IN (
        SELECT record_id FROM demo_dataset_records
        WHERE record_type = 'RAW_TRANSACTION'
      );
      DELETE FROM monthly_budgets
      WHERE month_key IN (
        SELECT record_id FROM demo_dataset_records
        WHERE record_type = 'MONTHLY_BUDGET'
      );
      DELETE FROM demo_dataset_records;
      DELETE FROM demo_dataset_state WHERE dataset_id = '${DEMO_DATASET_ID}';
    `);
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function updateMonthlyAllocation(
  database: Database,
  monthKey: string,
  currency: string,
  budgetBaseMinor: number,
  ratios: AllocationRatios,
  updatedAt: string,
): Promise<MonthlyBudget> {
  const budget = createMonthlyBudget(
    monthKey,
    currency,
    budgetBaseMinor,
    ratios,
    updatedAt,
  );
  const result = await database.runAsync(
    `UPDATE monthly_budgets
       SET living_ratio_bp = ?, saving_ratio_bp = ?, fun_ratio_bp = ?,
         living_target_minor = ?, saving_target_minor = ?, fun_target_minor = ?,
         updated_at = ?
       WHERE month_key = ? AND closed_at IS NULL;`,
    budget.livingRatioBp,
    budget.savingRatioBp,
    budget.funRatioBp,
    budget.livingTargetMinor,
    budget.savingTargetMinor,
    budget.funTargetMinor,
    updatedAt,
    monthKey,
  );
  if (result.changes !== 1) {
    throw new DomainValidationError(
      'Only the open current month allocation can be changed.',
    );
  }
  return budget;
}

export async function queryLedgerTransactions(
  database: Database,
  query: LedgerQuery,
  currency: string,
): Promise<LedgerQueryResult> {
  if (
    query.subscriptionStatuses !== undefined &&
    query.subscriptionStatuses.length > 0
  ) {
    throw new DomainValidationError(
      'Subscription filters are unavailable until subscription metadata ships.',
    );
  }

  const { clauses, params } = buildQueryWhere(query, currency);
  const rows = await database.getAllAsync<{ id: string }>(
    `SELECT r.id
       FROM raw_transactions r
       JOIN transaction_classifications c
         ON c.raw_transaction_id = r.id AND c.active = 1
       WHERE ${clauses.join(' AND ')}
       ORDER BY r.created_at DESC, r.id;`,
    ...params,
  );
  const matchIds = rows.map(({ id }) => id);
  const [matches, resolutionTransactions] = await Promise.all([
    loadClassifiedTransactions(database, matchIds),
    loadClassifiedTransactionsByCurrency(database, currency),
  ]);
  return { matches, resolutionTransactions };
}

export async function loadLedgerSnapshot(
  database: Database,
  requestedMonth?: string,
): Promise<LedgerSnapshot> {
  const state = await database.getFirstAsync<{ fixture_version: number }>(
    'SELECT fixture_version FROM demo_dataset_state WHERE dataset_id = ?;',
    DEMO_DATASET_ID,
  );
  const monthRows = await database.getAllAsync<{ month_key: string }>(
    'SELECT month_key FROM monthly_budgets ORDER BY month_key DESC;',
  );
  const months = monthRows.map(({ month_key }) => month_key);
  const activeMonth =
    requestedMonth !== undefined && months.includes(requestedMonth)
      ? requestedMonth
      : (months[0] ?? null);

  if (activeMonth === null) {
    return {
      isDemoLoaded: state?.fixture_version === DEMO_FIXTURE_VERSION,
      months,
      activeMonth: null,
      ledgerMonth: null,
    };
  }

  return {
    isDemoLoaded: state?.fixture_version === DEMO_FIXTURE_VERSION,
    months,
    activeMonth,
    ledgerMonth: await loadLedgerMonth(database, activeMonth),
  };
}

export async function loadLedgerMonth(
  database: Database,
  monthKey: string,
): Promise<LedgerMonth> {
  const budgetRow = await database.getFirstAsync<MonthlyBudgetRow>(
    'SELECT * FROM monthly_budgets WHERE month_key = ?;',
    monthKey,
  );
  if (budgetRow === null) {
    throw new Error('Requested ledger month is unavailable.');
  }

  const transactions = await loadClassifiedTransactions(database);
  const budget = mapBudget(budgetRow);
  const summary = calculateMonthlyBudget(
    monthKey,
    budget.currency,
    transactions,
    {
      LIVING: budget.livingRatioBp,
      SAVING: budget.savingRatioBp,
      FUN: budget.funRatioBp,
    },
  );

  return {
    budget,
    summary: {
      ...summary,
      budgetBaseMinor: budget.budgetBaseMinor,
      livingTargetMinor: budget.livingTargetMinor,
      savingTargetMinor: budget.savingTargetMinor,
      funTargetMinor: budget.funTargetMinor,
    },
    transactions: transactions.filter(
      ({ raw }) =>
        raw.currency === budget.currency &&
        raw.createdAt.slice(0, 7) === monthKey,
    ),
    resolutionTransactions: transactions.filter(
      ({ raw }) => raw.currency === budget.currency,
    ),
  };
}

async function loadClassifiedTransactions(
  database: Database,
  rawIds?: readonly string[],
): Promise<readonly ClassifiedTransaction[]> {
  if (rawIds !== undefined && rawIds.length === 0) {
    return [];
  }
  const idClause =
    rawIds === undefined
      ? ''
      : `WHERE r.id IN (${rawIds.map(() => '?').join(', ')})`;
  const [rows, splitRows, categoryRows] = await Promise.all([
    database.getAllAsync<JoinedTransactionRow>(
      `SELECT
        r.id AS raw_id, r.source, r.source_transaction_id, r.source_account_id,
        r.amount_minor, r.currency, r.description, r.merchant_id, r.merchant_name,
        r.source_category, r.created_at AS raw_created_at, r.settled_at,
        r.raw_payload_json, r.first_seen_at, r.last_synced_at, r.source_deleted,
        c.id AS classification_id, c.event_type, c.budget_scope, c.category_id,
        c.classification_source, c.confidence, c.counts_toward_budget_base,
        c.offset_raw_transaction_id, c.note,
        c.created_at AS classification_created_at,
        c.updated_at AS classification_updated_at,
        category.name AS category_name, super.key AS super_category_key,
        category.default_budget_scope
       FROM raw_transactions r
       JOIN transaction_classifications c
         ON c.raw_transaction_id = r.id AND c.active = 1
       LEFT JOIN categories category ON category.id = c.category_id
       LEFT JOIN super_categories super ON super.id = category.super_category_id
       ${idClause}
       ORDER BY r.created_at DESC, r.id;`,
      ...(rawIds ?? []),
    ),
    database.getAllAsync<SplitRow>(
      'SELECT * FROM transaction_splits ORDER BY raw_transaction_id, rowid;',
    ),
    database.getAllAsync<CategoryRow>(
      `SELECT category.id, category.name, super.key AS super_category,
        category.default_budget_scope
       FROM categories category
       JOIN super_categories super ON super.id = category.super_category_id;`,
    ),
  ]);
  const categories = new Map(
    categoryRows.map((row) => [row.id, mapCategory(row)]),
  );

  return rows.map((row) => {
    const splits = splitRows
      .filter(({ raw_transaction_id }) => raw_transaction_id === row.raw_id)
      .map(mapSplit);
    return {
      raw: mapRaw(row),
      classification: mapClassification(row),
      category:
        row.category_id === null
          ? null
          : (categories.get(row.category_id) ?? null),
      splits,
      splitCategories: splits.flatMap((split) => {
        const category =
          split.categoryId === null ? null : categories.get(split.categoryId);
        return category === undefined || category === null ? [] : [category];
      }),
    };
  });
}

async function loadClassifiedTransactionsByCurrency(
  database: Database,
  currency: string,
): Promise<readonly ClassifiedTransaction[]> {
  const ids = await database.getAllAsync<{ id: string }>(
    'SELECT id FROM raw_transactions WHERE currency = ?;',
    currency,
  );
  return loadClassifiedTransactions(
    database,
    ids.map(({ id }) => id),
  );
}

function buildQueryWhere(
  query: LedgerQuery,
  currency: string,
): { readonly clauses: string[]; readonly params: DatabaseValue[] } {
  const clauses = ['r.currency = ?', 'r.source_deleted = 0'];
  const params: DatabaseValue[] = [currency];

  if (query.date.kind === 'DAY') {
    assertDate(query.date.date);
    clauses.push('substr(r.created_at, 1, 10) = ?');
    params.push(query.date.date);
  } else if (query.date.kind === 'MONTH') {
    assertMonth(query.date.month);
    clauses.push('substr(r.created_at, 1, 7) = ?');
    params.push(query.date.month);
  } else {
    assertDate(query.date.startDate);
    assertDate(query.date.endDate);
    if (query.date.startDate > query.date.endDate) {
      throw new DomainValidationError(
        'Query start date must not follow end date.',
      );
    }
    clauses.push('substr(r.created_at, 1, 10) BETWEEN ? AND ?');
    params.push(query.date.startDate, query.date.endDate);
  }

  if (query.merchant !== undefined) {
    clauses.push(
      `lower(COALESCE(r.merchant_name, r.description)) LIKE ? ESCAPE '\\'`,
    );
    params.push(`%${escapeLike(query.merchant.toLowerCase())}%`);
  }
  addClassificationOrSplitClause(
    clauses,
    params,
    'event_type',
    query.eventTypes,
  );
  addClassificationOrSplitClause(clauses, params, 'budget_scope', query.scopes);

  if (query.categoryIds !== undefined && query.categoryIds.length > 0) {
    const placeholders = query.categoryIds.map(() => '?').join(', ');
    clauses.push(
      `(c.category_id IN (${placeholders}) OR EXISTS (
        SELECT 1 FROM transaction_splits split
        WHERE split.raw_transaction_id = r.id
          AND split.category_id IN (${placeholders})
      ) OR EXISTS (
        SELECT 1
        FROM transaction_classifications offset_classification
        WHERE offset_classification.raw_transaction_id =
          c.offset_raw_transaction_id
          AND offset_classification.active = 1
          AND (
            offset_classification.category_id IN (${placeholders})
            OR EXISTS (
              SELECT 1 FROM transaction_splits offset_split
              WHERE offset_split.raw_transaction_id =
                offset_classification.raw_transaction_id
                AND offset_split.category_id IN (${placeholders})
            )
          )
      ))`,
    );
    params.push(
      ...query.categoryIds,
      ...query.categoryIds,
      ...query.categoryIds,
      ...query.categoryIds,
    );
  }
  if (query.superCategories !== undefined && query.superCategories.length > 0) {
    const placeholders = query.superCategories.map(() => '?').join(', ');
    clauses.push(
      `EXISTS (
        SELECT 1
        FROM categories category
        JOIN super_categories super
          ON super.id = category.super_category_id
        WHERE super.key IN (${placeholders})
          AND (
            category.id = c.category_id OR category.id IN (
              SELECT split.category_id FROM transaction_splits split
              WHERE split.raw_transaction_id = r.id
            ) OR category.id IN (
              SELECT offset_classification.category_id
              FROM transaction_classifications offset_classification
              WHERE offset_classification.raw_transaction_id =
                c.offset_raw_transaction_id
                AND offset_classification.active = 1
            ) OR category.id IN (
              SELECT offset_split.category_id
              FROM transaction_classifications offset_classification
              JOIN transaction_splits offset_split
                ON offset_split.raw_transaction_id =
                  offset_classification.raw_transaction_id
              WHERE offset_classification.raw_transaction_id =
                c.offset_raw_transaction_id
                AND offset_classification.active = 1
            )
          )
      )`,
    );
    params.push(...query.superCategories);
  }
  if (query.amount !== undefined) {
    if (
      !Number.isSafeInteger(query.amount.thresholdMinor) ||
      query.amount.thresholdMinor < 0
    ) {
      throw new DomainValidationError(
        'Query amount threshold must be a non-negative integer.',
      );
    }
    const operators = {
      EQUAL: '=',
      GREATER_THAN: '>',
      GREATER_THAN_OR_EQUAL: '>=',
      LESS_THAN: '<',
      LESS_THAN_OR_EQUAL: '<=',
    } as const;
    clauses.push(`abs(r.amount_minor) ${operators[query.amount.comparator]} ?`);
    params.push(query.amount.thresholdMinor);
  }
  return { clauses, params };
}

function addClassificationOrSplitClause(
  clauses: string[],
  params: DatabaseValue[],
  column: 'event_type' | 'budget_scope',
  values: readonly string[] | undefined,
): void {
  if (values === undefined || values.length === 0) {
    return;
  }
  const placeholders = values.map(() => '?').join(', ');
  clauses.push(
    `(c.${column} IN (${placeholders}) OR EXISTS (
      SELECT 1 FROM transaction_splits split
      WHERE split.raw_transaction_id = r.id
        AND split.${column} IN (${placeholders})
    ))`,
  );
  params.push(...values, ...values);
}

function escapeLike(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function assertDate(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new DomainValidationError('Query date must use YYYY-MM-DD.');
  }
}

function assertMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new DomainValidationError('Query month must use YYYY-MM.');
  }
}

async function ownRecord(
  database: Database,
  recordType: 'RAW_TRANSACTION' | 'MONTHLY_BUDGET',
  recordId: string,
): Promise<void> {
  await database.runAsync(
    `INSERT OR IGNORE INTO demo_dataset_records (record_type, record_id)
     VALUES (?, ?);`,
    recordType,
    recordId,
  );
}

function demoRawId(id: string): string {
  return `demo:${id}`;
}

function mapBudget(row: MonthlyBudgetRow): MonthlyBudget {
  return {
    monthKey: row.month_key,
    currency: row.currency,
    budgetBaseMinor: row.budget_base_minor,
    budgetBaseMode: row.budget_base_mode,
    livingRatioBp: row.living_ratio_bp,
    savingRatioBp: row.saving_ratio_bp,
    funRatioBp: row.fun_ratio_bp,
    livingTargetMinor: row.living_target_minor,
    savingTargetMinor: row.saving_target_minor,
    funTargetMinor: row.fun_target_minor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

function mapRaw(row: JoinedTransactionRow): RawTransaction {
  return {
    id: row.raw_id,
    source: row.source,
    sourceTransactionId: row.source_transaction_id,
    sourceAccountId: row.source_account_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    description: row.description,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    sourceCategory: row.source_category,
    createdAt: row.raw_created_at,
    settledAt: row.settled_at,
    rawPayloadJson: row.raw_payload_json,
    firstSeenAt: row.first_seen_at,
    lastSyncedAt: row.last_synced_at,
    sourceDeleted: row.source_deleted === 1,
  };
}

function mapClassification(row: JoinedTransactionRow): Classification {
  return {
    id: row.classification_id,
    rawTransactionId: row.raw_id,
    eventType: row.event_type,
    budgetScope: row.budget_scope,
    categoryId: row.category_id,
    classificationSource: row.classification_source,
    confidence: row.confidence,
    countsTowardBudgetBase: row.counts_toward_budget_base === 1,
    offsetRawTransactionId: row.offset_raw_transaction_id,
    note: row.note,
    createdAt: row.classification_created_at,
    updatedAt: row.classification_updated_at,
  };
}

function mapSplit(row: SplitRow): TransactionSplit {
  return {
    id: row.id,
    rawTransactionId: row.raw_transaction_id,
    amountMinorAbs: row.amount_minor_abs,
    eventType: row.event_type,
    budgetScope: row.budget_scope,
    categoryId: row.category_id,
    classificationSource: row.classification_source,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    superCategory: row.super_category,
    defaultBudgetScope: row.default_budget_scope,
  };
}
