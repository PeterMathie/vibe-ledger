import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createExplorerViewModel,
  createHomeViewModel,
  matchesFilter,
} from '../src/app/view-models';
import {
  importDemoData,
  loadLedgerSnapshot,
  type LedgerMonth,
} from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import { NodeDatabase } from './support/node-database';

describe('Home and Explorer view models', () => {
  let database: NodeDatabase;
  let ledgerMonth: LedgerMonth;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
    await importDemoData(database);
    const snapshot = await loadLedgerSnapshot(database, '2026-09');
    if (snapshot.ledgerMonth === null) {
      throw new Error('Expected demo month.');
    }
    ledgerMonth = snapshot.ledgerMonth;
  });

  afterEach(() => {
    database.close();
  });

  it('presents exact targets, actuals, status, and separate saving movement', () => {
    const home = createHomeViewModel(
      ledgerMonth.budget,
      ledgerMonth.summary,
      ledgerMonth.transactions,
    );

    expect(home).toMatchObject({
      monthKey: '2026-09',
      monthLabel: 'September 2026',
      budgetBaseLabel: '£3,000.00',
      allocationLabel: 'Living 50% · Saving 30% · Fun 20%',
      needsReviewLabel: '1 synthetic transaction needs review',
    });
    expect(home.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'LIVING',
          actualLabel: '£1,045.00',
          targetLabel: '£1,500.00',
          statusLabel: '£455.00 left',
          filter: { month: '2026-09', superCategory: 'LIVING' },
        }),
        expect.objectContaining({
          key: 'SAVING',
          actualLabel: '£900.00',
          statusLabel: '£0.00 to go',
          secondaryLabel: 'Net savings movement -£4,100.00',
          filter: { month: '2026-09', superCategory: 'SAVING' },
        }),
      ]),
    );
  });

  it('honours the exact Home super-category drill-down payload', () => {
    const filter = { month: '2026-09', superCategory: 'FUN' } as const;
    const explorer = createExplorerViewModel(
      ledgerMonth.transactions,
      filter,
      ledgerMonth.budget.currency,
    );

    expect(explorer.title).toBe('Fun details');
    expect(explorer.transactions.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'demo:dinner-reimbursement',
        'demo:dinner',
        'demo:clothing-refund',
        'demo:clothing',
        'demo:holiday-coffee',
        'demo:holiday-hotel',
        'demo:tesco-split',
        'demo:coffee',
      ]),
    );
    expect(explorer.excludedSpendLabel).toBe('£100,700.00');
  });

  it('keeps split drill-down totals equal to the selected Home allocation', () => {
    const explorer = createExplorerViewModel(
      ledgerMonth.resolutionTransactions,
      { month: '2026-09', superCategory: 'LIVING' },
      ledgerMonth.budget.currency,
    );

    expect(explorer.includedSpendLabel).toBe('£1,045.00');
    expect(explorer.breakdown.map(({ label }) => label)).toEqual([
      'Rent',
      'Subscriptions',
      'Groceries',
    ]);
  });

  it('honours exact-date filters and exposes semantic status on every row', () => {
    const explorer = createExplorerViewModel(
      ledgerMonth.transactions,
      { month: '2026-09', date: '2026-09-03' },
      ledgerMonth.budget.currency,
    );

    expect(explorer).toMatchObject({
      title: 'Day details',
      periodLabel: '2026-09-03',
      includedSpendLabel: '£70.00',
      transactionCountLabel: '1 transaction',
    });
    expect(explorer.transactions[0]).toMatchObject({
      id: 'demo:tesco-split',
      categoryLabel: 'Split: Groceries + Nights out',
      superCategoryLabel: 'Living + Fun',
      typeLabel: 'Purchase',
      scopeLabel: 'Included in budget',
    });
  });

  it('keeps excluded and neutral records visible without counting them', () => {
    const explorer = createExplorerViewModel(
      ledgerMonth.transactions,
      { month: '2026-09' },
      ledgerMonth.budget.currency,
    );

    expect(explorer.excludedSpendLabel).toBe('£100,700.00');
    expect(
      explorer.transactions.find(({ id }) => id === 'demo:needs-review'),
    ).toMatchObject({
      typeLabel: 'Ignore / neutral',
      confidenceLabel: 'Needs review',
    });
  });

  it('matches refunds through their linked original category', () => {
    const refund = ledgerMonth.transactions.find(
      ({ raw }) => raw.id === 'demo:clothing-refund',
    );
    if (refund === undefined) {
      throw new Error('Expected refund fixture.');
    }
    const byId = new Map(
      ledgerMonth.transactions.map((transaction) => [
        transaction.raw.id,
        transaction,
      ]),
    );

    expect(
      matchesFilter(refund, { month: '2026-09', superCategory: 'FUN' }, byId),
    ).toBe(true);
  });

  it('resolves a cross-month refund using repository context', async () => {
    await database.runAsync(
      `INSERT INTO raw_transactions (
        id, source, source_transaction_id, amount_minor, currency, description,
        created_at, raw_payload_json, first_seen_at, last_synced_at
      ) VALUES (
        'test:cross-refund', 'test', 'cross-refund', 2400, 'GBP',
        'SYNTHETIC CROSS MONTH REFUND', '2026-09-24T10:00:00.000Z',
        '{}', '2026-09-24', '2026-09-24'
      );`,
    );
    await database.runAsync(
      `INSERT INTO transaction_classifications (
        id, raw_transaction_id, event_type, budget_scope, category_id,
        classification_source, confidence, counts_toward_budget_base,
        offset_raw_transaction_id, active, created_at, updated_at
      ) VALUES (
        'test:cross-refund:classification', 'test:cross-refund', 'REFUND',
        'INCLUDED', NULL, 'MANUAL', 'MANUAL', 0, 'demo:aug-cinema', 1,
        '2026-09-24', '2026-09-24'
      );`,
    );
    const snapshot = await loadLedgerSnapshot(database, '2026-09');
    const context = snapshot.ledgerMonth?.resolutionTransactions ?? [];

    const explorer = createExplorerViewModel(
      context,
      { month: '2026-09', superCategory: 'FUN' },
      'GBP',
    );

    expect(explorer.transactions.map(({ id }) => id)).toContain(
      'test:cross-refund',
    );
  });

  it('reports split-level exclusions in totals and row status', () => {
    const transactions = ledgerMonth.transactions.map((transaction) =>
      transaction.raw.id === 'demo:tesco-split'
        ? {
            ...transaction,
            splits: transaction.splits.map((split, index) =>
              index === 0
                ? { ...split, budgetScope: 'EXCLUDED' as const }
                : split,
            ),
          }
        : transaction,
    );

    const explorer = createExplorerViewModel(
      transactions,
      { month: '2026-09', date: '2026-09-03' },
      'GBP',
    );

    expect(explorer.includedSpendLabel).toBe('£15.00');
    expect(explorer.excludedSpendLabel).toBe('£55.00');
    expect(explorer.transactions[0]?.scopeLabel).toBe(
      'Partly excluded from budget',
    );
  });
});
