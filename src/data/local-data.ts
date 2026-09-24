import type { Database, DatabaseValue } from './database';

export const PORTABLE_EXPORT_SCHEMA = 'vibe-ledger-local-data';
export const PORTABLE_EXPORT_VERSION = 1;
export const PORTABLE_EXPORT_WARNING =
  'This export contains sensitive financial data. Store and share it carefully.';

type PortableValue = string | number | null;
type PortableRow = Readonly<Record<string, PortableValue>>;

export interface PortableExport {
  readonly schema: typeof PORTABLE_EXPORT_SCHEMA;
  readonly version: typeof PORTABLE_EXPORT_VERSION;
  readonly exportedAt: string;
  readonly warning: typeof PORTABLE_EXPORT_WARNING;
  readonly data: Readonly<Record<TableName, readonly PortableRow[]>>;
}

export interface LocalReadiness {
  readonly storage: 'LOCAL_SQLITE';
  readonly networkRequired: false;
  readonly schemaVersion: number;
  readonly integrity: 'OK';
  readonly lastLocalDataChangeAt: string | null;
}

type FieldKind =
  | 'string'
  | 'nullableString'
  | 'integer'
  | 'nullableInteger'
  | 'booleanInteger'
  | 'currency'
  | 'timestamp'
  | 'nullableTimestamp'
  | 'date'
  | 'nullableDate'
  | 'month';

interface TableDefinition {
  readonly columns: Readonly<Record<string, FieldKind>>;
}

const TABLES = {
  super_categories: {
    columns: {
      id: 'string',
      key: 'string',
      name: 'string',
      sort_order: 'integer',
      active: 'booleanInteger',
    },
  },
  categories: {
    columns: {
      id: 'string',
      name: 'string',
      super_category_id: 'string',
      icon: 'nullableString',
      default_budget_scope: 'string',
      active: 'booleanInteger',
      sort_order: 'integer',
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  raw_transactions: {
    columns: {
      id: 'string',
      source: 'string',
      source_transaction_id: 'string',
      source_account_id: 'nullableString',
      amount_minor: 'integer',
      currency: 'currency',
      description: 'string',
      merchant_id: 'nullableString',
      merchant_name: 'nullableString',
      source_category: 'nullableString',
      created_at: 'timestamp',
      settled_at: 'nullableTimestamp',
      first_seen_at: 'timestamp',
      last_synced_at: 'timestamp',
      source_deleted: 'booleanInteger',
    },
  },
  transaction_classifications: {
    columns: {
      id: 'string',
      raw_transaction_id: 'string',
      event_type: 'string',
      budget_scope: 'string',
      category_id: 'nullableString',
      classification_source: 'string',
      confidence: 'string',
      counts_toward_budget_base: 'booleanInteger',
      offset_raw_transaction_id: 'nullableString',
      note: 'nullableString',
      active: 'booleanInteger',
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  transaction_splits: {
    columns: {
      id: 'string',
      raw_transaction_id: 'string',
      amount_minor_abs: 'integer',
      event_type: 'string',
      budget_scope: 'string',
      category_id: 'nullableString',
      classification_source: 'string',
      note: 'nullableString',
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  classification_rules: {
    columns: {
      id: 'string',
      priority: 'integer',
      enabled: 'booleanInteger',
      match_type: 'string',
      match_value: 'string',
      result_event_type: 'string',
      result_category_id: 'nullableString',
      result_budget_scope: 'nullableString',
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  monthly_budgets: {
    columns: {
      month_key: 'month',
      currency: 'currency',
      budget_base_minor: 'integer',
      budget_base_mode: 'string',
      living_ratio_bp: 'integer',
      saving_ratio_bp: 'integer',
      fun_ratio_bp: 'integer',
      living_target_minor: 'integer',
      saving_target_minor: 'integer',
      fun_target_minor: 'integer',
      created_at: 'timestamp',
      updated_at: 'timestamp',
      closed_at: 'nullableTimestamp',
    },
  },
  income_adjustments: {
    columns: {
      id: 'string',
      month_key: 'month',
      amount_minor_signed: 'integer',
      reason: 'string',
      created_at: 'timestamp',
    },
  },
  classification_changes: {
    columns: {
      id: 'string',
      raw_transaction_id: 'string',
      before_json: 'string',
      after_json: 'string',
      created_at: 'timestamp',
      undone_at: 'nullableTimestamp',
    },
  },
  subscriptions: {
    columns: {
      id: 'string',
      name: 'string',
      merchant_match: 'nullableString',
      billing_amount_minor: 'integer',
      billing_currency: 'currency',
      interval_months: 'nullableInteger',
      interval_days: 'nullableInteger',
      last_payment_date: 'nullableDate',
      next_expected_date: 'nullableDate',
      detection_state: 'string',
      renewal_intent: 'string',
      category_id: 'string',
      active: 'booleanInteger',
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  subscription_reserve_plans: {
    columns: {
      id: 'string',
      subscription_id: 'string',
      target_amount_minor: 'integer',
      target_currency: 'currency',
      reserved_amount_minor: 'integer',
      target_date: 'date',
      enabled: 'booleanInteger',
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  subscription_transactions: {
    columns: {
      subscription_id: 'string',
      raw_transaction_id: 'string',
      linked_at: 'timestamp',
    },
  },
  subscription_detection_denials: {
    columns: {
      signature: 'string',
      denied_at: 'timestamp',
    },
  },
  demo_dataset_records: {
    columns: {
      record_type: 'string',
      record_id: 'string',
    },
  },
  demo_dataset_state: {
    columns: {
      dataset_id: 'string',
      fixture_version: 'integer',
      loaded_at: 'timestamp',
    },
  },
} as const satisfies Readonly<Record<string, TableDefinition>>;

type TableName = keyof typeof TABLES;

const INSERT_ORDER = Object.keys(TABLES) as TableName[];
const DELETE_ORDER = [...INSERT_ORDER].reverse();
const SYNTHETIC_SOURCES = new Set(['demo', 'fixture']);
const FORBIDDEN_KEY = /(token|secret|password|authorization|credential)/i;

export async function exportLocalData(
  database: Database,
  exportedAt: string,
): Promise<PortableExport> {
  assertTimestamp(exportedAt, 'exportedAt');
  const data = {} as Record<TableName, readonly PortableRow[]>;

  await database.execAsync('BEGIN;');
  try {
    for (const table of INSERT_ORDER) {
      const columns = Object.keys(TABLES[table].columns);
      const where =
        table === 'raw_transactions'
          ? ` WHERE source IN ('demo', 'fixture')`
          : '';
      const rows = await database.getAllAsync<PortableRow>(
        `SELECT ${columns.join(', ')} FROM ${table}${where}
         ORDER BY ${columns.join(', ')};`,
      );
      data[table] = rows.map((row) => ({ ...row }));
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }

  const exportedRawIds = new Set(data.raw_transactions.map(({ id }) => id));
  data.transaction_classifications = data.transaction_classifications.filter(
    ({ raw_transaction_id }) => exportedRawIds.has(raw_transaction_id),
  );
  data.transaction_splits = data.transaction_splits.filter(
    ({ raw_transaction_id }) => exportedRawIds.has(raw_transaction_id),
  );
  data.classification_changes = data.classification_changes.filter(
    ({ raw_transaction_id }) => exportedRawIds.has(raw_transaction_id),
  );
  data.subscription_transactions = data.subscription_transactions.filter(
    ({ raw_transaction_id }) => exportedRawIds.has(raw_transaction_id),
  );

  const portable = {
    schema: PORTABLE_EXPORT_SCHEMA,
    version: PORTABLE_EXPORT_VERSION,
    exportedAt,
    warning: PORTABLE_EXPORT_WARNING,
    data,
  };
  return validatePortableExport(portable);
}

export async function restoreLocalData(
  database: Database,
  input: unknown,
): Promise<void> {
  const portable = validatePortableExport(input);

  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await deletePortableData(database);
    for (const table of INSERT_ORDER) {
      for (const row of portable.data[table]) {
        await insertRow(database, table, row);
      }
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function wipeLocalData(database: Database): Promise<void> {
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    for (const table of DELETE_ORDER) {
      if (table !== 'categories' && table !== 'super_categories') {
        await database.execAsync(`DELETE FROM ${table};`);
      }
    }
    await database.execAsync(`
      DELETE FROM categories
      WHERE id NOT IN (
        'category:rent', 'category:bills', 'category:groceries',
        'category:transport', 'category:subscriptions',
        'category:house-saving', 'category:investments',
        'category:holiday-saving', 'category:emergency-fund',
        'category:coffee', 'category:shopping', 'category:restaurants',
        'category:nights-out', 'category:cinema'
      );
      UPDATE super_categories SET
        name = CASE key
          WHEN 'LIVING' THEN 'Living'
          WHEN 'SAVING' THEN 'Saving'
          WHEN 'FUN' THEN 'Fun'
        END,
        sort_order = CASE key
          WHEN 'LIVING' THEN 1 WHEN 'SAVING' THEN 2 WHEN 'FUN' THEN 3
        END,
        active = 1;
      UPDATE categories SET
        name = CASE id
          WHEN 'category:rent' THEN 'Rent'
          WHEN 'category:bills' THEN 'Bills'
          WHEN 'category:groceries' THEN 'Groceries'
          WHEN 'category:transport' THEN 'Transport'
          WHEN 'category:subscriptions' THEN 'Subscriptions'
          WHEN 'category:house-saving' THEN 'House saving'
          WHEN 'category:investments' THEN 'Investments'
          WHEN 'category:holiday-saving' THEN 'Holiday saving'
          WHEN 'category:emergency-fund' THEN 'Emergency fund'
          WHEN 'category:coffee' THEN 'Coffee'
          WHEN 'category:shopping' THEN 'Shopping'
          WHEN 'category:restaurants' THEN 'Restaurants'
          WHEN 'category:nights-out' THEN 'Nights out'
          WHEN 'category:cinema' THEN 'Cinema'
        END,
        super_category_id = CASE
          WHEN id IN (
            'category:rent', 'category:bills', 'category:groceries',
            'category:transport', 'category:subscriptions'
          ) THEN 'super:living'
          WHEN id IN (
            'category:house-saving', 'category:investments',
            'category:holiday-saving', 'category:emergency-fund'
          ) THEN 'super:saving'
          ELSE 'super:fun'
        END,
        icon = NULL,
        default_budget_scope = 'INCLUDED',
        active = 1,
        sort_order = CASE id
          WHEN 'category:rent' THEN 10
          WHEN 'category:bills' THEN 20
          WHEN 'category:groceries' THEN 30
          WHEN 'category:transport' THEN 40
          WHEN 'category:subscriptions' THEN 50
          WHEN 'category:house-saving' THEN 10
          WHEN 'category:investments' THEN 20
          WHEN 'category:holiday-saving' THEN 30
          WHEN 'category:emergency-fund' THEN 40
          WHEN 'category:coffee' THEN 10
          WHEN 'category:shopping' THEN 20
          WHEN 'category:restaurants' THEN 30
          WHEN 'category:nights-out' THEN 40
          WHEN 'category:cinema' THEN 50
        END,
        created_at = '1970-01-01T00:00:00.000Z',
        updated_at = '1970-01-01T00:00:00.000Z';
    `);
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function getLocalReadiness(
  database: Database,
): Promise<LocalReadiness> {
  const version = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const integrity = await database.getFirstAsync<{ integrity_check: string }>(
    'PRAGMA integrity_check;',
  );
  if (integrity?.integrity_check !== 'ok') {
    throw new Error('Local storage integrity check failed.');
  }
  const latest = await database.getFirstAsync<{ changed_at: string | null }>(
    `SELECT max(changed_at) AS changed_at FROM (
       SELECT max(updated_at) AS changed_at FROM monthly_budgets
       UNION ALL SELECT max(updated_at) FROM transaction_classifications
       UNION ALL SELECT max(updated_at) FROM subscriptions
       UNION ALL SELECT max(last_synced_at) FROM raw_transactions
     );`,
  );

  return {
    storage: 'LOCAL_SQLITE',
    networkRequired: false,
    schemaVersion: version?.user_version ?? 0,
    integrity: 'OK',
    lastLocalDataChangeAt: latest?.changed_at ?? null,
  };
}

export function validatePortableExport(input: unknown): PortableExport {
  assertPlainObject(input, 'export');
  assertExactKeys(input, [
    'schema',
    'version',
    'exportedAt',
    'warning',
    'data',
  ]);
  if (input.schema !== PORTABLE_EXPORT_SCHEMA) {
    throw new Error('Unsupported export schema.');
  }
  if (input.version !== PORTABLE_EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${String(input.version)}.`);
  }
  if (input.warning !== PORTABLE_EXPORT_WARNING) {
    throw new Error('Export warning is missing or invalid.');
  }
  assertTimestamp(input.exportedAt, 'exportedAt');
  assertPlainObject(input.data, 'data');
  assertExactKeys(input.data, INSERT_ORDER);

  for (const table of INSERT_ORDER) {
    const rows = input.data[table];
    if (!Array.isArray(rows)) {
      throw new Error(`${table} must be an array.`);
    }
    for (const [index, row] of rows.entries()) {
      validateRow(table, row, index);
    }
  }
  assertRequiredCatalog(input.data);

  return input as unknown as PortableExport;
}

async function deletePortableData(database: Database): Promise<void> {
  for (const table of DELETE_ORDER) {
    await database.execAsync(`DELETE FROM ${table};`);
  }
}

async function insertRow(
  database: Database,
  table: TableName,
  row: PortableRow,
): Promise<void> {
  const columns = Object.keys(TABLES[table].columns);
  const values = columns.map((column) => row[column] as DatabaseValue);
  const rawPayloadColumn =
    table === 'raw_transactions' ? ', raw_payload_json' : '';
  const rawPayloadValue = table === 'raw_transactions' ? ", '{}'" : '';
  await database.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}${rawPayloadColumn})
     VALUES (${columns.map(() => '?').join(', ')}${rawPayloadValue});`,
    ...values,
  );
}

function validateRow(table: TableName, input: unknown, index: number): void {
  const path = `${table}[${index}]`;
  assertPlainObject(input, path);
  const fields = TABLES[table].columns;
  assertExactKeys(input, Object.keys(fields));

  for (const [field, kind] of Object.entries(fields)) {
    if (FORBIDDEN_KEY.test(field)) {
      throw new Error(`${path}.${field} is not exportable.`);
    }
    validateValue(input[field], kind, `${path}.${field}`);
  }

  if (
    table === 'raw_transactions' &&
    !SYNTHETIC_SOURCES.has(String(input.source))
  ) {
    throw new Error(`${path}.source is not a portable synthetic source.`);
  }
  if (table === 'classification_changes') {
    assertSafeEmbeddedJson(input.before_json, `${path}.before_json`);
    assertSafeEmbeddedJson(input.after_json, `${path}.after_json`);
  }
}

function validateValue(value: unknown, kind: FieldKind, path: string): void {
  if (kind === 'nullableString' && value === null) return;
  if (kind === 'nullableInteger' && value === null) return;
  if (kind === 'nullableTimestamp' && value === null) return;
  if (kind === 'nullableDate' && value === null) return;
  if (
    (kind === 'string' || kind === 'nullableString') &&
    typeof value === 'string'
  ) {
    return;
  }
  if (kind === 'currency' && /^[A-Z]{3}$/.test(String(value))) return;
  if (kind === 'timestamp' || kind === 'nullableTimestamp') {
    assertTimestamp(value, path);
    return;
  }
  if (kind === 'date' || kind === 'nullableDate') {
    assertDate(value, path);
    return;
  }
  if (kind === 'month' && isCalendarDate(`${String(value)}-01`)) return;
  if (
    (kind === 'integer' || kind === 'nullableInteger') &&
    typeof value === 'number' &&
    Number.isSafeInteger(value)
  ) {
    return;
  }
  if (kind === 'booleanInteger' && (value === 0 || value === 1)) return;
  throw new Error(`${path} is invalid.`);
}

function assertTimestamp(value: unknown, path: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (!isCalendarDate(value) &&
      (!/^\d{4}-\d{2}-\d{2}T/.test(value) ||
        !isCalendarDate(value.slice(0, 10)) ||
        Number.isNaN(new Date(value).valueOf())))
  ) {
    throw new Error(`${path} must be a valid timestamp.`);
  }
}

function assertDate(value: unknown, path: string): void {
  if (typeof value !== 'string' || !isCalendarDate(value)) {
    throw new Error(`${path} must be a valid date.`);
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
  );
}

function assertPlainObject(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${path} must be an object.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error('Export contains unknown or missing fields.');
  }
}

function assertSafeEmbeddedJson(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    throw new Error(`${path} is invalid.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${path} is invalid JSON.`);
  }
  assertNoForbiddenKeys(parsed, path);
}

function assertRequiredCatalog(data: Record<string, unknown>): void {
  const superCategories = data.super_categories as PortableRow[];
  const actualSuperCategories = new Map(
    superCategories.map((row) => [row.id, row.key]),
  );
  const requiredSuperCategories = new Map([
    ['super:living', 'LIVING'],
    ['super:saving', 'SAVING'],
    ['super:fun', 'FUN'],
  ]);
  for (const [id, key] of requiredSuperCategories) {
    if (actualSuperCategories.get(id) !== key) {
      throw new Error(`Export is missing required super-category ${id}.`);
    }
  }

  const categoryIds = new Set(
    (data.categories as PortableRow[]).map((row) => row.id),
  );
  const requiredCategoryIds = [
    'category:rent',
    'category:bills',
    'category:groceries',
    'category:transport',
    'category:subscriptions',
    'category:house-saving',
    'category:investments',
    'category:holiday-saving',
    'category:emergency-fund',
    'category:coffee',
    'category:shopping',
    'category:restaurants',
    'category:nights-out',
    'category:cinema',
  ];
  for (const id of requiredCategoryIds) {
    if (!categoryIds.has(id)) {
      throw new Error(`Export is missing required category ${id}.`);
    }
  }
}

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, `${path}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`${path} contains a forbidden secret field.`);
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}
