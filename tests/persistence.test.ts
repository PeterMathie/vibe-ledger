import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import fixture from '../fixtures/semantic-fixtures.json';
import { saveManualClassification } from '../src/data/classification-repository';
import { importFixture } from '../src/data/fixture-importer';
import { MIGRATIONS, migrateDatabase } from '../src/data/migrations';
import type { Classification } from '../src/domain/types';
import { NodeDatabase } from './support/node-database';

describe('BL-003 local schema and BL-004 fixture importer', () => {
  let database: NodeDatabase;

  beforeEach(() => {
    database = new NodeDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('keeps migration versions contiguous and names stable', () => {
    expect(MIGRATIONS.map(({ version }) => version)).toEqual([1, 2]);
    expect(MIGRATIONS.map(({ name }) => name)).toEqual([
      'phase-zero-foundation',
      'demo-dataset-ownership',
    ]);
  });

  it('migrates a fresh database and is safe to run again', async () => {
    await migrateDatabase(database);
    await migrateDatabase(database);

    const version = await database.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version;',
    );
    expect(version?.user_version).toBe(2);

    const tables = await database.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name;`,
    );
    expect(tables.map(({ name }) => name)).toEqual([
      'categories',
      'classification_rules',
      'demo_dataset_records',
      'demo_dataset_state',
      'income_adjustments',
      'monthly_budgets',
      'raw_transactions',
      'super_categories',
      'transaction_classifications',
      'transaction_splits',
    ]);
    expect(
      await database.getAllAsync<{ id: string; key: string }>(
        'SELECT id, key FROM super_categories ORDER BY sort_order;',
      ),
    ).toEqual([
      { id: 'super:living', key: 'LIVING' },
      { id: 'super:saving', key: 'SAVING' },
      { id: 'super:fun', key: 'FUN' },
    ]);
  });

  it('enforces unique source transaction identity', async () => {
    await migrateDatabase(database);
    await database.runAsync(
      `INSERT INTO raw_transactions (
        id, source, source_transaction_id, amount_minor, currency, description,
        created_at, raw_payload_json, first_seen_at, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      'one',
      'fixture',
      'same-id',
      -420,
      'GBP',
      'COFFEE',
      '2026-09-01T00:00:00.000Z',
      '{}',
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    );

    await expect(
      database.runAsync(
        `INSERT INTO raw_transactions (
          id, source, source_transaction_id, amount_minor, currency, description,
          created_at, raw_payload_json, first_seen_at, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        'two',
        'fixture',
        'same-id',
        -420,
        'GBP',
        'COFFEE',
        '2026-09-01T00:00:00.000Z',
        '{}',
        '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
      ),
    ).rejects.toThrow();
  });

  it('imports fixtures idempotently without creating classifications', async () => {
    await migrateDatabase(database);

    const first = await importFixture(
      database,
      fixture,
      '2026-09-24T10:00:00.000Z',
    );
    const second = await importFixture(
      database,
      fixture,
      '2026-09-24T10:01:00.000Z',
    );

    expect(first).toEqual({
      inserted: fixture.events.length,
      unchanged: 0,
    });
    expect(second).toEqual({
      inserted: 0,
      unchanged: fixture.events.length,
    });
    expect(
      await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) AS count FROM transaction_classifications;',
      ),
    ).toEqual({ count: 0 });
  });

  it('stores manual reclassification history without rewriting raw data', async () => {
    await migrateDatabase(database);
    await importFixture(database, fixture, '2026-09-24T10:00:00.000Z');

    await saveManualClassification(
      database,
      manualClassification(
        'classification:coffee:1',
        'fixture:coffee',
        'SPEND',
        'category:shopping',
        '2026-09-24T10:01:00.000Z',
      ),
    );
    await saveManualClassification(
      database,
      manualClassification(
        'classification:coffee:2',
        'fixture:coffee',
        'SPEND',
        'category:coffee',
        '2026-11-02T10:00:00.000Z',
      ),
    );

    const rows = await database.getAllAsync<{
      category_id: string;
      active: number;
    }>(
      `SELECT category_id, active
       FROM transaction_classifications
       WHERE raw_transaction_id = 'fixture:coffee'
       ORDER BY created_at;`,
    );
    expect(rows).toEqual([
      { category_id: 'category:shopping', active: 0 },
      { category_id: 'category:coffee', active: 1 },
    ]);
    expect(
      await database.getFirstAsync<{ amount_minor: number }>(
        `SELECT amount_minor
         FROM raw_transactions
         WHERE id = 'fixture:coffee';`,
      ),
    ).toEqual({ amount_minor: -420 });
  });
});

function manualClassification(
  id: string,
  rawTransactionId: string,
  eventType: Classification['eventType'],
  categoryId: string,
  timestamp: string,
): Classification {
  return {
    id,
    rawTransactionId,
    eventType,
    budgetScope: 'INCLUDED',
    categoryId,
    classificationSource: 'MANUAL',
    confidence: 'MANUAL',
    countsTowardBudgetBase: false,
    offsetRawTransactionId: null,
    note: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
