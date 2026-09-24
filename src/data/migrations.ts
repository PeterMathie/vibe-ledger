import type { Database } from './database';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'phase-zero-foundation',
    sql: `
      CREATE TABLE super_categories (
        id TEXT PRIMARY KEY NOT NULL,
        key TEXT NOT NULL UNIQUE CHECK (key IN ('LIVING', 'SAVING', 'FUN')),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
      );

      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        super_category_id TEXT NOT NULL REFERENCES super_categories(id),
        icon TEXT,
        default_budget_scope TEXT NOT NULL DEFAULT 'INCLUDED'
          CHECK (default_budget_scope IN ('INCLUDED', 'EXCLUDED')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE raw_transactions (
        id TEXT PRIMARY KEY NOT NULL,
        source TEXT NOT NULL,
        source_transaction_id TEXT NOT NULL,
        source_account_id TEXT,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL CHECK (length(currency) = 3),
        description TEXT NOT NULL,
        merchant_id TEXT,
        merchant_name TEXT,
        source_category TEXT,
        created_at TEXT NOT NULL,
        settled_at TEXT,
        raw_payload_json TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        source_deleted INTEGER NOT NULL DEFAULT 0 CHECK (source_deleted IN (0, 1)),
        UNIQUE (source, source_transaction_id)
      );

      CREATE TABLE transaction_classifications (
        id TEXT PRIMARY KEY NOT NULL,
        raw_transaction_id TEXT NOT NULL REFERENCES raw_transactions(id),
        event_type TEXT NOT NULL CHECK (event_type IN (
          'INCOME', 'SPEND', 'SAVING_CONTRIBUTION', 'SAVING_WITHDRAWAL',
          'INTERNAL_TRANSFER', 'REFUND', 'REIMBURSEMENT', 'DEBT_PAYMENT', 'NEUTRAL'
        )),
        budget_scope TEXT NOT NULL CHECK (budget_scope IN ('INCLUDED', 'EXCLUDED')),
        category_id TEXT REFERENCES categories(id),
        classification_source TEXT NOT NULL CHECK (classification_source IN (
          'MANUAL', 'RULE', 'SUBSCRIPTION', 'TRANSFER_RULE',
          'IMPORT_HINT', 'DEFAULT'
        )),
        confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW', 'MANUAL')),
        counts_toward_budget_base INTEGER NOT NULL DEFAULT 0
          CHECK (counts_toward_budget_base IN (0, 1)),
        offset_raw_transaction_id TEXT REFERENCES raw_transactions(id),
        note TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX one_active_classification_per_transaction
        ON transaction_classifications(raw_transaction_id)
        WHERE active = 1;

      CREATE TABLE transaction_splits (
        id TEXT PRIMARY KEY NOT NULL,
        raw_transaction_id TEXT NOT NULL REFERENCES raw_transactions(id),
        amount_minor_abs INTEGER NOT NULL CHECK (amount_minor_abs >= 0),
        event_type TEXT NOT NULL CHECK (event_type IN (
          'INCOME', 'SPEND', 'SAVING_CONTRIBUTION', 'SAVING_WITHDRAWAL',
          'INTERNAL_TRANSFER', 'REFUND', 'REIMBURSEMENT', 'DEBT_PAYMENT', 'NEUTRAL'
        )),
        budget_scope TEXT NOT NULL CHECK (budget_scope IN ('INCLUDED', 'EXCLUDED')),
        category_id TEXT REFERENCES categories(id),
        classification_source TEXT NOT NULL CHECK (classification_source IN (
          'MANUAL', 'RULE', 'SUBSCRIPTION', 'TRANSFER_RULE',
          'IMPORT_HINT', 'DEFAULT'
        )),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE classification_rules (
        id TEXT PRIMARY KEY NOT NULL,
        priority INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        match_type TEXT NOT NULL CHECK (match_type IN (
          'merchant_id', 'merchant_name', 'description_regex', 'account', 'counterparty'
        )),
        match_value TEXT NOT NULL,
        result_event_type TEXT NOT NULL,
        result_category_id TEXT REFERENCES categories(id),
        result_budget_scope TEXT CHECK (result_budget_scope IN ('INCLUDED', 'EXCLUDED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE monthly_budgets (
        month_key TEXT PRIMARY KEY NOT NULL CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
        currency TEXT NOT NULL CHECK (length(currency) = 3),
        budget_base_minor INTEGER NOT NULL,
        budget_base_mode TEXT NOT NULL CHECK (budget_base_mode IN ('AUTO', 'MANUAL')),
        living_ratio_bp INTEGER NOT NULL,
        saving_ratio_bp INTEGER NOT NULL,
        fun_ratio_bp INTEGER NOT NULL,
        living_target_minor INTEGER NOT NULL,
        saving_target_minor INTEGER NOT NULL,
        fun_target_minor INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT,
        CHECK (living_ratio_bp + saving_ratio_bp + fun_ratio_bp = 10000)
      );

      CREATE TABLE income_adjustments (
        id TEXT PRIMARY KEY NOT NULL,
        month_key TEXT NOT NULL REFERENCES monthly_budgets(month_key),
        amount_minor_signed INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO super_categories (id, key, name, sort_order)
      VALUES
        ('super:living', 'LIVING', 'Living', 1),
        ('super:saving', 'SAVING', 'Saving', 2),
        ('super:fun', 'FUN', 'Fun', 3);

      INSERT INTO categories (
        id, name, super_category_id, default_budget_scope, active, sort_order,
        created_at, updated_at
      ) VALUES
        ('category:rent', 'Rent', 'super:living', 'INCLUDED', 1, 10, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:bills', 'Bills', 'super:living', 'INCLUDED', 1, 20, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:groceries', 'Groceries', 'super:living', 'INCLUDED', 1, 30, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:transport', 'Transport', 'super:living', 'INCLUDED', 1, 40, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:subscriptions', 'Subscriptions', 'super:living', 'INCLUDED', 1, 50, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:house-saving', 'House saving', 'super:saving', 'INCLUDED', 1, 10, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:investments', 'Investments', 'super:saving', 'INCLUDED', 1, 20, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:holiday-saving', 'Holiday saving', 'super:saving', 'INCLUDED', 1, 30, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:emergency-fund', 'Emergency fund', 'super:saving', 'INCLUDED', 1, 40, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:coffee', 'Coffee', 'super:fun', 'INCLUDED', 1, 10, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:shopping', 'Shopping', 'super:fun', 'INCLUDED', 1, 20, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:restaurants', 'Restaurants', 'super:fun', 'INCLUDED', 1, 30, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:nights-out', 'Nights out', 'super:fun', 'INCLUDED', 1, 40, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
        ('category:cinema', 'Cinema', 'super:fun', 'INCLUDED', 1, 50, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');

      CREATE INDEX raw_transactions_created_at ON raw_transactions(created_at);
      CREATE INDEX raw_transactions_merchant_id ON raw_transactions(merchant_id);
      CREATE INDEX raw_transactions_description ON raw_transactions(description);
      CREATE INDEX classifications_event_type ON transaction_classifications(event_type);
      CREATE INDEX classifications_category_id ON transaction_classifications(category_id);
      CREATE INDEX categories_super_category_id ON categories(super_category_id);
      CREATE INDEX classification_rules_priority ON classification_rules(priority, enabled);
    `,
  },
  {
    version: 2,
    name: 'demo-dataset-ownership',
    sql: `
      CREATE TABLE demo_dataset_records (
        record_type TEXT NOT NULL CHECK (record_type IN ('RAW_TRANSACTION', 'MONTHLY_BUDGET')),
        record_id TEXT NOT NULL,
        PRIMARY KEY (record_type, record_id)
      );

      CREATE TABLE demo_dataset_state (
        dataset_id TEXT PRIMARY KEY NOT NULL,
        fixture_version INTEGER NOT NULL CHECK (fixture_version > 0),
        loaded_at TEXT NOT NULL
      );
    `,
  },
];

export async function migrateDatabase(database: Database): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const row = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  let currentVersion = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    await database.execAsync('BEGIN IMMEDIATE;');
    try {
      await database.execAsync(migration.sql);
      await database.execAsync(`PRAGMA user_version = ${migration.version};`);
      await database.execAsync('COMMIT;');
      currentVersion = migration.version;
    } catch (error) {
      await database.execAsync('ROLLBACK;');
      throw error;
    }
  }
}
