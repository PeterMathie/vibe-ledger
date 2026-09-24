import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  exportLocalData,
  getLocalReadiness,
  PORTABLE_EXPORT_VERSION,
  restoreLocalData,
  validatePortableExport,
  wipeLocalData,
} from '../src/data/local-data';
import {
  importDemoData,
  loadLedgerSnapshot,
} from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import { NodeDatabase } from './support/node-database';

const EXPORTED_AT = '2026-09-24T18:00:00.000Z';

describe('BL-040 strict local export, restore, and wipe', () => {
  let database: NodeDatabase;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
  });

  afterEach(() => {
    database.close();
  });

  it('round-trips every allow-listed local record idempotently', async () => {
    await importDemoData(database);
    const first = await exportLocalData(database, EXPORTED_AT);

    await wipeLocalData(database);
    await restoreLocalData(database, first);

    expect(await exportLocalData(database, EXPORTED_AT)).toEqual(first);
    await restoreLocalData(database, first);
    expect(await exportLocalData(database, EXPORTED_AT)).toEqual(first);
  });

  it('rejects version mismatches, unknown fields, and invalid money', async () => {
    await importDemoData(database);
    const exported = await exportLocalData(database, EXPORTED_AT);

    expect(() =>
      validatePortableExport({
        ...exported,
        version: PORTABLE_EXPORT_VERSION + 1,
      }),
    ).toThrow('Unsupported export version');
    expect(() =>
      validatePortableExport({ ...exported, accessToken: 'must-not-export' }),
    ).toThrow('unknown or missing fields');
    expect(() =>
      validatePortableExport({
        ...exported,
        data: {
          ...exported.data,
          monthly_budgets: exported.data.monthly_budgets.map((row, index) =>
            index === 0 ? { ...row, budget_base_minor: 1.25 } : row,
          ),
        },
      }),
    ).toThrow('budget_base_minor is invalid');
    expect(() =>
      validatePortableExport({
        ...exported,
        data: {
          ...exported.data,
          monthly_budgets: exported.data.monthly_budgets.map((row, index) =>
            index === 0 ? { ...row, currency: 'gbp' } : row,
          ),
        },
      }),
    ).toThrow('currency is invalid');
    expect(() =>
      validatePortableExport({
        ...exported,
        data: {
          ...exported.data,
          raw_transactions: exported.data.raw_transactions.map((row, index) =>
            index === 0 ? { ...row, created_at: '2026-02-30' } : row,
          ),
        },
      }),
    ).toThrow('created_at must be a valid timestamp');
    expect(() =>
      validatePortableExport({
        ...exported,
        data: { ...exported.data, categories: [] },
      }),
    ).toThrow('missing required category');
  });

  it('never exports source payloads, credentials, or non-synthetic raw rows', async () => {
    await importDemoData(database);
    await database.runAsync(
      `INSERT INTO raw_transactions (
        id, source, source_transaction_id, amount_minor, currency, description,
        created_at, raw_payload_json, first_seen_at, last_synced_at
      ) VALUES (
        'future:source', 'future-adapter', 'source-id', -100, 'GBP', 'PRIVATE',
        '2026-09-24', '{"access_token":"secret"}', '2026-09-24', '2026-09-24'
      );`,
    );

    const serialized = JSON.stringify(
      await exportLocalData(database, EXPORTED_AT),
    );
    expect(serialized).not.toContain('future:source');
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('raw_payload_json');
    expect(serialized).not.toContain('secret');
  });

  it('rolls back the whole restore if relational validation fails', async () => {
    await importDemoData(database);
    const before = await exportLocalData(database, EXPORTED_AT);
    const broken = {
      ...before,
      data: {
        ...before.data,
        subscriptions: before.data.subscriptions.map((row, index) => ({
          ...row,
          category_id: index === 0 ? 'category:missing' : row.category_id,
        })),
      },
    };

    await expect(restoreLocalData(database, broken)).rejects.toThrow();
    expect(await exportLocalData(database, EXPORTED_AT)).toEqual(before);
  });

  it('wipes only the app database, restarts empty, and can reload demo data', async () => {
    await importDemoData(database);
    await database.runAsync(
      `INSERT INTO categories (
        id, name, super_category_id, default_budget_scope, active, sort_order,
        created_at, updated_at
      ) VALUES (
        'category:custom', 'Custom private category', 'super:fun',
        'INCLUDED', 1, 99, '2026-09-24', '2026-09-24'
      );`,
    );

    await wipeLocalData(database);

    expect((await loadLedgerSnapshot(database)).ledgerMonth).toBeNull();
    expect((await loadLedgerSnapshot(database)).isDemoLoaded).toBe(false);
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count FROM categories WHERE id = 'category:custom';`,
      ),
    ).toEqual({ count: 0 });
    expect(
      await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) AS count FROM raw_transactions;',
      ),
    ).toEqual({ count: 0 });

    await importDemoData(database);
    expect((await loadLedgerSnapshot(database)).isDemoLoaded).toBe(true);
  });
});

describe('BL-041 offline local readiness', () => {
  it('reports SQLite readiness without a network dependency', async () => {
    const database = new NodeDatabase();
    try {
      await migrateDatabase(database);
      await importDemoData(database);
      await expect(getLocalReadiness(database)).resolves.toEqual({
        storage: 'LOCAL_SQLITE',
        networkRequired: false,
        schemaVersion: 4,
        integrity: 'OK',
        lastLocalDataChangeAt: '2026-09-24T12:00:00.000Z',
      });
    } finally {
      database.close();
    }
  });
});
