import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  importDemoData,
  loadLedgerSnapshot,
  queryLedgerTransactions,
  resetDemoData,
  updateMonthlyAllocation,
} from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import { DEMO_BUDGETS, DEMO_TRANSACTIONS } from '../src/demo/fixtures';
import { monthQuery } from '../src/domain/query';
import { NodeDatabase } from './support/node-database';

describe('synthetic Demo Data repository', () => {
  let database: NodeDatabase;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
  });

  afterEach(() => {
    database.close();
  });

  it('imports an owned, classified dataset idempotently', async () => {
    const first = await importDemoData(database);
    const second = await importDemoData(database);

    expect(first).toEqual({
      insertedTransactions: DEMO_TRANSACTIONS.length,
      insertedBudgets: DEMO_BUDGETS.length,
      unchangedTransactions: 0,
    });
    expect(second).toEqual({
      insertedTransactions: 0,
      insertedBudgets: 0,
      unchangedTransactions: DEMO_TRANSACTIONS.length,
    });
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count
         FROM transaction_classifications
         WHERE active = 1;`,
      ),
    ).toEqual({ count: DEMO_TRANSACTIONS.length });
  });

  it('offers bootstrap again when an installed fixture catalog is stale', async () => {
    await importDemoData(database);
    await database.runAsync(
      'UPDATE demo_dataset_state SET fixture_version = ?;',
      1,
    );

    expect((await loadLedgerSnapshot(database)).isDemoLoaded).toBe(false);
    const refreshed = await importDemoData(database);
    expect(refreshed).toMatchObject({
      insertedTransactions: 0,
      insertedBudgets: 0,
      unchangedTransactions: DEMO_TRANSACTIONS.length,
    });
    expect((await loadLedgerSnapshot(database)).isDemoLoaded).toBe(true);
  });

  it('loads stored historical targets and engine-derived current actuals', async () => {
    await importDemoData(database);

    const september = await loadLedgerSnapshot(database, '2026-09');
    const august = await loadLedgerSnapshot(database, '2026-08');

    expect(september.ledgerMonth?.summary).toMatchObject({
      budgetBaseMinor: 300_000,
      livingTargetMinor: 150_000,
      savingTargetMinor: 90_000,
      funTargetMinor: 60_000,
      livingActualMinor: 104_500,
      funActualMinor: 136_320,
      savingContributedMinor: 90_000,
      savingWithdrawnMinor: 500_000,
      netSavingsMovementMinor: -410_000,
    });
    expect(august.ledgerMonth?.summary).toMatchObject({
      budgetBaseMinor: 280_000,
      livingTargetMinor: 154_000,
      savingTargetMinor: 70_000,
      funTargetMinor: 56_000,
    });
  });

  it('resets only records explicitly owned by the demo dataset', async () => {
    await database.runAsync(
      `INSERT INTO monthly_budgets (
        month_key, currency, budget_base_minor, budget_base_mode,
        living_ratio_bp, saving_ratio_bp, fun_ratio_bp,
        living_target_minor, saving_target_minor, fun_target_minor,
        created_at, updated_at
      ) VALUES (
        '2026-10', 'GBP', 100000, 'MANUAL', 5000, 3000, 2000,
        50000, 30000, 20000, '2026-10-01', '2026-10-01'
      );`,
    );
    await importDemoData(database);

    await resetDemoData(database);

    expect(
      await database.getAllAsync<{ month_key: string }>(
        'SELECT month_key FROM monthly_budgets ORDER BY month_key;',
      ),
    ).toEqual([{ month_key: '2026-10' }]);
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count
         FROM raw_transactions
         WHERE source = 'demo';`,
      ),
    ).toEqual({ count: 0 });
    expect((await loadLedgerSnapshot(database)).isDemoLoaded).toBe(false);
  });

  it('preserves exact split portions and low-confidence review records', async () => {
    await importDemoData(database);
    const snapshot = await loadLedgerSnapshot(database, '2026-09');
    const transactions = snapshot.ledgerMonth?.transactions ?? [];

    const split = transactions.find(({ raw }) => raw.id === 'demo:tesco-split');
    expect(split?.splits.map(({ amountMinorAbs }) => amountMinorAbs)).toEqual([
      5_500, 1_500,
    ]);
    expect(
      transactions.find(({ raw }) => raw.id === 'demo:needs-review')
        ?.classification.confidence,
    ).toBe('LOW');
  });

  it('keeps prior-month offset context but excludes foreign currency rows', async () => {
    await importDemoData(database);
    await database.runAsync(
      `INSERT INTO raw_transactions (
        id, source, source_transaction_id, amount_minor, currency, description,
        created_at, raw_payload_json, first_seen_at, last_synced_at
      ) VALUES (
        'test:usd', 'test', 'usd', -5000, 'USD', 'SYNTHETIC USD',
        '2026-09-10T12:00:00.000Z', '{}', '2026-09-10', '2026-09-10'
      );`,
    );
    await database.runAsync(
      `INSERT INTO transaction_classifications (
        id, raw_transaction_id, event_type, budget_scope, category_id,
        classification_source, confidence, counts_toward_budget_base,
        active, created_at, updated_at
      ) VALUES (
        'test:usd:classification', 'test:usd', 'SPEND', 'INCLUDED',
        'category:coffee', 'MANUAL', 'MANUAL', 0, 1,
        '2026-09-10', '2026-09-10'
      );`,
    );

    const snapshot = await loadLedgerSnapshot(database, '2026-09');
    const currentIds =
      snapshot.ledgerMonth?.transactions.map(({ raw }) => raw.id) ?? [];
    const resolutionIds =
      snapshot.ledgerMonth?.resolutionTransactions.map(({ raw }) => raw.id) ??
      [];

    expect(currentIds).not.toContain('test:usd');
    expect(resolutionIds).not.toContain('test:usd');
    expect(resolutionIds).toContain('demo:aug-cinema');
    expect(currentIds).not.toContain('demo:aug-cinema');
  });

  it('persists allocation only for the open month and preserves history', async () => {
    await importDemoData(database);

    const updated = await updateMonthlyAllocation(
      database,
      '2026-09',
      'GBP',
      300_000,
      { LIVING: 4_000, SAVING: 3_500, FUN: 2_500 },
      '2026-09-25T12:00:00.000Z',
    );
    expect(updated).toMatchObject({
      livingTargetMinor: 120_000,
      savingTargetMinor: 105_000,
      funTargetMinor: 75_000,
    });
    expect(
      (await loadLedgerSnapshot(database, '2026-09')).ledgerMonth?.budget,
    ).toMatchObject({
      livingRatioBp: 4_000,
      savingRatioBp: 3_500,
      funRatioBp: 2_500,
    });

    await expect(
      updateMonthlyAllocation(
        database,
        '2026-08',
        'GBP',
        280_000,
        { LIVING: 4_000, SAVING: 3_500, FUN: 2_500 },
        '2026-09-25T12:00:00.000Z',
      ),
    ).rejects.toThrow('Only the open current month');
    expect(
      (await loadLedgerSnapshot(database, '2026-08')).ledgerMonth?.budget,
    ).toMatchObject({
      livingRatioBp: 5_500,
      savingRatioBp: 2_500,
      funRatioBp: 2_000,
    });
  });

  it('queries typed dates, amounts, types, scopes, and linked categories', async () => {
    await importDemoData(database);

    const day = await queryLedgerTransactions(
      database,
      { date: { kind: 'DAY', date: '2026-09-03' } },
      'GBP',
    );
    expect(day.matches.map(({ raw }) => raw.id)).toEqual(['demo:tesco-split']);

    const range = await queryLedgerTransactions(
      database,
      {
        date: {
          kind: 'RANGE',
          startDate: '2026-09-20',
          endDate: '2026-09-22',
        },
        eventTypes: ['REFUND', 'REIMBURSEMENT'],
        scopes: ['INCLUDED'],
        amount: {
          comparator: 'GREATER_THAN_OR_EQUAL',
          thresholdMinor: 4_000,
        },
      },
      'GBP',
    );
    expect(range.matches.map(({ raw }) => raw.id).sort()).toEqual([
      'demo:clothing-refund',
      'demo:dinner-reimbursement',
    ]);

    const linkedFun = await queryLedgerTransactions(
      database,
      monthQuery('2026-09', { superCategories: ['FUN'] }),
      'GBP',
    );
    expect(linkedFun.matches.map(({ raw }) => raw.id)).toEqual(
      expect.arrayContaining([
        'demo:clothing-refund',
        'demo:dinner-reimbursement',
        'demo:tesco-split',
      ]),
    );
  });

  it('parameterizes merchant text and escapes LIKE wildcards', async () => {
    await importDemoData(database);
    const injection = await queryLedgerTransactions(
      database,
      monthQuery('2026-09', { merchant: "' OR 1=1 --" }),
      'GBP',
    );
    expect(injection.matches).toEqual([]);
    expect(
      await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) AS count FROM raw_transactions;',
      ),
    ).toEqual({ count: DEMO_TRANSACTIONS.length });

    const literalWildcard = await queryLedgerTransactions(
      database,
      monthQuery('2026-09', { merchant: '%_' }),
      'GBP',
    );
    expect(literalWildcard.matches).toEqual([]);
  });

  it('filters Needs Review and weekdays without interpolating values', async () => {
    await importDemoData(database);
    const review = await queryLedgerTransactions(
      database,
      monthQuery('2026-09', { needsReview: true }),
      'GBP',
    );
    expect(review.matches.map(({ raw }) => raw.id)).toEqual([
      'demo:needs-review',
    ]);

    const weekends = await queryLedgerTransactions(
      database,
      monthQuery('2026-09', { weekdays: [0, 6] }),
      'GBP',
    );
    expect(weekends.matches.length).toBeGreaterThan(0);
    expect(
      weekends.matches.every(({ raw }) =>
        [0, 6].includes(new Date(raw.createdAt).getUTCDay()),
      ),
    ).toBe(true);
  });

  it('supports subscription filters and rejects invalid query values', async () => {
    await importDemoData(database);
    const subscriptions = await queryLedgerTransactions(
      database,
      monthQuery('2026-09', {
        subscriptionStatuses: ['CONFIRMED'],
      }),
      'GBP',
    );
    expect(subscriptions.matches.map(({ raw }) => raw.id)).toEqual([
      'demo:annual-subscription',
    ]);
    await expect(
      queryLedgerTransactions(
        database,
        monthQuery('2026-09', {
          amount: { comparator: 'EQUAL', thresholdMinor: 1.5 },
        }),
        'GBP',
      ),
    ).rejects.toThrow('non-negative integer');
  });
});
