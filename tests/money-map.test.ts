import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createMoneyMapModel,
  proportionalFlowWidth,
} from '../src/app/money-map';
import {
  importDemoData,
  loadLedgerSnapshot,
  type LedgerMonth,
} from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import { NodeDatabase } from './support/node-database';

describe('Experimental Money Map', () => {
  let database: NodeDatabase;
  let september: LedgerMonth;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
    await importDemoData(database);
    const snapshot = await loadLedgerSnapshot(database, '2026-09');
    if (snapshot.ledgerMonth === null) {
      throw new Error('Expected September ledger.');
    }
    september = snapshot.ledgerMonth;
  });

  afterEach(() => database.close());

  it('uses stored plan targets without inventing category budgets', () => {
    const model = map('PLAN');

    expect(model).toMatchObject({
      mode: 'PLAN',
      month: '2026-09',
      currency: 'GBP',
      budgetBaseMinor: 300_000,
      budgetBaseLabel: '£3,000.00',
    });
    expect(model.branches).toMatchObject([
      { key: 'LIVING', amountMinor: 150_000, overflowBasisPoints: 10_000 },
      { key: 'SAVING', amountMinor: 90_000, overflowBasisPoints: 10_000 },
      { key: 'FUN', amountMinor: 60_000, overflowBasisPoints: 10_000 },
    ]);
    expect(
      model.branches.every(({ categories }) => categories.length === 0),
    ).toBe(true);
  });

  it('uses canonical actual measures and keeps net savings separate', () => {
    const model = map('ACTUAL');
    expect(model.branches.map(({ amountMinor }) => amountMinor)).toEqual([
      104_500, 90_000, 136_320,
    ]);
    expect(model.branches.map(({ measureLabel }) => measureLabel)).toEqual([
      'included spending',
      'saving contributions',
      'included spending',
    ]);
    expect(model).toMatchObject({
      netSavingsMovementMinor: -410_000,
      netSavingsMovementLabel: '-£4,100.00',
    });
  });

  it('preserves exact month and filters in node and stream drill-downs', () => {
    const model = map('ACTUAL');
    const fun = model.branches.find(({ key }) => key === 'FUN');
    const coffee = fun?.categories.find(({ id }) => id === 'category:coffee');

    expect(fun?.drillDown).toEqual({
      date: { kind: 'MONTH', month: '2026-09' },
      superCategories: ['FUN'],
      scopes: ['INCLUDED'],
    });
    expect(coffee?.drillDown).toEqual({
      date: { kind: 'MONTH', month: '2026-09' },
      categoryIds: ['category:coffee'],
      scopes: ['INCLUDED'],
    });
  });

  it('uses stored historical targets', async () => {
    const snapshot = await loadLedgerSnapshot(database, '2026-08');
    if (snapshot.ledgerMonth === null) {
      throw new Error('Expected August ledger.');
    }
    const model = createMoneyMapModel(
      'PLAN',
      snapshot.ledgerMonth.budget,
      snapshot.ledgerMonth.transactions,
      snapshot.ledgerMonth.resolutionTransactions,
    );
    expect(model.branches.map(({ targetMinor }) => targetMinor)).toEqual([
      154_000, 70_000, 56_000,
    ]);
  });

  it('shows net-zero refund activity and excludes excluded spend', () => {
    const model = map('ACTUAL');
    const shopping = model.branches
      .find(({ key }) => key === 'FUN')
      ?.categories.find(({ id }) => id === 'category:shopping');
    expect(shopping).toMatchObject({
      amountMinor: 0,
      direction: 'ZERO',
      hasOffset: true,
    });
    expect(model.accessibilityRows).toContain(
      'Fun, Shopping, £0.00, net activity after refund or reimbursement offset',
    );
    expect(model.branches.find(({ key }) => key === 'FUN')?.amountMinor).toBe(
      136_320,
    );
  });

  it('represents negative category activity without negative geometry', () => {
    const refundOnly = september.transactions.filter(
      ({ raw }) => raw.id === 'demo:clothing-refund',
    );
    const model = createMoneyMapModel(
      'ACTUAL',
      september.budget,
      refundOnly,
      september.resolutionTransactions,
    );
    const category = model.branches
      .find(({ key }) => key === 'FUN')
      ?.categories.find(({ id }) => id === 'category:shopping');
    expect(category).toMatchObject({
      amountMinor: -12_000,
      direction: 'OFFSET',
      width: 11.2,
    });
  });

  it('preserves zero-target and extreme overflow meaning with bounded nodes', () => {
    const zeroTargetBudget = {
      ...september.budget,
      funTargetMinor: 0,
      funRatioBp: 0,
    };
    const model = createMoneyMapModel(
      'ACTUAL',
      zeroTargetBudget,
      september.transactions,
      september.resolutionTransactions,
    );
    expect(model.branches.find(({ key }) => key === 'FUN')).toMatchObject({
      statusLabel: 'No target set; activity shown at budget-base scale',
      overflowBasisPoints: 10_001,
    });
    expect(proportionalFlowWidth(100_000_00, 60_000)).toBeCloseTo(46_666.67);
    expect(proportionalFlowWidth(Number.MAX_SAFE_INTEGER, 1)).toBe(50_000);
  });

  it('partitions currencies and provides an exact textual alternative', () => {
    const model = createMoneyMapModel(
      'ACTUAL',
      september.budget,
      september.transactions,
      september.resolutionTransactions,
      ['USD', 'GBP', 'USD'],
    );
    expect(model.otherCurrencies).toEqual(['USD']);
    expect(model.accessibilityRows).toContain(
      'Net savings movement, -£4,100.00, displayed separately from saving contributions',
    );
    expect(model.accessibilityRows.some((row) => row.includes('Coffee'))).toBe(
      true,
    );
  });

  it('keeps layout work linear with one geometry record per category', () => {
    const model = map('ACTUAL');
    const categoryCount = model.branches.reduce(
      (total, branch) => total + branch.categories.length,
      0,
    );
    expect(categoryCount).toBeLessThanOrEqual(13);
    expect(model.branches).toHaveLength(3);
  });

  function map(mode: 'PLAN' | 'ACTUAL') {
    return createMoneyMapModel(
      mode,
      september.budget,
      september.transactions,
      september.resolutionTransactions,
    );
  }
});
