import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { saveTransactionCorrection } from '../src/data/classification-repository';
import { importDemoData, queryLedgerTrends } from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import type { TrendRequest } from '../src/domain/trends';
import { NodeDatabase } from './support/node-database';

const AUGUST_TO_SEPTEMBER: TrendRequest = {
  startMonth: '2026-08',
  endMonth: '2026-09',
  selection: { kind: 'OVERALL' },
};

describe('Trends aggregation', () => {
  let database: NodeDatabase;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
    await importDemoData(database);
  });

  afterEach(() => {
    database.close();
  });

  it('keeps overall semantic measures separate with stored monthly targets', async () => {
    const model = await queryLedgerTrends(database, AUGUST_TO_SEPTEMBER, 'GBP');

    expect(model.months.map(({ month }) => month)).toEqual([
      '2026-08',
      '2026-09',
    ]);
    expect(model.months[0]?.bars).toMatchObject([
      {
        label: 'Living',
        measure: 'INCLUDED_SPENDING',
        actualMinor: 88_000,
        targetMinor: 154_000,
      },
      {
        label: 'Saving',
        measure: 'SAVING_CONTRIBUTIONS',
        actualMinor: 0,
        targetMinor: 70_000,
      },
      {
        label: 'Fun',
        measure: 'INCLUDED_SPENDING',
        actualMinor: 2_400,
        targetMinor: 56_000,
      },
    ]);
    expect(model.months[1]).toMatchObject({
      netSavingsMovementMinor: -410_000,
      bars: [
        { actualMinor: 104_500, targetMinor: 150_000 },
        { actualMinor: 90_000, targetMinor: 90_000 },
        { actualMinor: 136_320, targetMinor: 60_000 },
      ],
    });
  });

  it('builds I1 single-super-category stacks with exact segment filters', async () => {
    const model = await queryLedgerTrends(
      database,
      {
        ...AUGUST_TO_SEPTEMBER,
        selection: {
          kind: 'SUPER_CATEGORIES',
          superCategories: ['FUN'],
        },
      },
      'GBP',
    );

    const september = model.months[1]?.bars[0];
    expect(september).toMatchObject({
      month: '2026-09',
      label: 'Fun',
      actualMinor: 136_320,
      targetMinor: 60_000,
      drillDown: {
        date: { kind: 'MONTH', month: '2026-09' },
        superCategories: ['FUN'],
        scopes: ['INCLUDED'],
      },
    });
    expect(
      september?.segments.find(({ id }) => id === 'category:coffee'),
    ).toMatchObject({
      label: 'Coffee',
      amountMinor: 820,
      transactionCount: 2,
      drillDown: {
        date: { kind: 'MONTH', month: '2026-09' },
        categoryIds: ['category:coffee'],
        scopes: ['INCLUDED'],
      },
    });
    expect(
      september?.segments.find(({ id }) => id === 'category:restaurants'),
    ).toMatchObject({ amountMinor: 4_000 });
    expect(
      september?.segments.find(({ id }) => id === 'category:shopping'),
    ).toMatchObject({ amountMinor: 0, transactionCount: 2 });
  });

  it('builds I2 an unstacked category series with no category target', async () => {
    const model = await queryLedgerTrends(
      database,
      {
        ...AUGUST_TO_SEPTEMBER,
        selection: {
          kind: 'CATEGORY',
          categoryId: 'category:coffee',
          categoryName: 'Coffee',
          superCategory: 'FUN',
        },
      },
      'GBP',
    );

    expect(model.months.map(({ bars }) => bars[0]?.actualMinor)).toEqual([
      0, 820,
    ]);
    expect(model.months[1]?.bars[0]).toMatchObject({
      label: 'Coffee',
      targetMinor: null,
      drillDown: {
        date: { kind: 'MONTH', month: '2026-09' },
        categoryIds: ['category:coffee'],
        scopes: ['INCLUDED'],
      },
    });
    expect(model.months[1]?.bars[0]?.segments).toHaveLength(1);
  });

  it('builds I3 grouped stacks rather than merging selected allocations', async () => {
    const model = await queryLedgerTrends(
      database,
      {
        ...AUGUST_TO_SEPTEMBER,
        selection: {
          kind: 'SUPER_CATEGORIES',
          superCategories: ['LIVING', 'FUN'],
        },
      },
      'GBP',
    );

    expect(model.months[1]?.bars).toMatchObject([
      {
        label: 'Living',
        actualMinor: 104_500,
        targetMinor: 150_000,
      },
      { label: 'Fun', actualMinor: 136_320, targetMinor: 60_000 },
    ]);
    expect(
      model.months[1]?.bars.map(({ segments }) => segments.length),
    ).toEqual([3, 5]);
  });

  it('recalculates historical actuals after correction without changing targets', async () => {
    const before = await queryLedgerTrends(
      database,
      AUGUST_TO_SEPTEMBER,
      'GBP',
    );
    await saveTransactionCorrection(database, {
      changeId: 'trends:change',
      classificationId: 'trends:classification',
      rawTransactionId: 'demo:coffee',
      eventType: 'SPEND',
      budgetScope: 'INCLUDED',
      categoryId: 'category:groceries',
      countsTowardBudgetBase: false,
      note: 'Move into Living',
      splits: [],
      timestamp: '2026-11-01T12:00:00.000Z',
    });
    const after = await queryLedgerTrends(database, AUGUST_TO_SEPTEMBER, 'GBP');

    expect(after.months[1]?.bars[0]).toMatchObject({
      actualMinor: 104_920,
      targetMinor: 150_000,
    });
    expect(after.months[1]?.bars[2]).toMatchObject({
      actualMinor: 135_900,
      targetMinor: 60_000,
    });
    expect(after.months[1]?.bars.map(({ targetMinor }) => targetMinor)).toEqual(
      before.months[1]?.bars.map(({ targetMinor }) => targetMinor),
    );
  });

  it('represents a cross-month refund as honest negative category activity', async () => {
    await insertBudget(database, '2026-10', 0, 7000, 3000, 0);
    await insertTransaction(database, {
      id: 'test:october-refund',
      amountMinor: 2_400,
      currency: 'GBP',
      createdAt: '2026-10-01T00:00:00.000Z',
      eventType: 'REFUND',
      categoryId: null,
      offsetId: 'demo:aug-cinema',
    });

    const model = await queryLedgerTrends(
      database,
      {
        startMonth: '2026-10',
        endMonth: '2026-10',
        selection: {
          kind: 'CATEGORY',
          categoryId: 'category:cinema',
          categoryName: 'Cinema',
          superCategory: 'FUN',
        },
      },
      'GBP',
    );

    expect(model.months[0]?.bars[0]).toMatchObject({
      actualMinor: -2_400,
      targetMinor: null,
      transactionCount: 1,
    });
  });

  it('preserves zero targets and exact calendar month boundaries', async () => {
    await insertBudget(database, '2026-10', 0, 7000, 3000, 0);
    await insertTransaction(database, {
      id: 'test:last-september',
      amountMinor: -100,
      currency: 'GBP',
      createdAt: '2026-09-30T23:59:59.999Z',
      eventType: 'SPEND',
      categoryId: 'category:coffee',
      offsetId: null,
    });
    await insertTransaction(database, {
      id: 'test:first-october',
      amountMinor: -200,
      currency: 'GBP',
      createdAt: '2026-10-01T00:00:00.000Z',
      eventType: 'SPEND',
      categoryId: 'category:coffee',
      offsetId: null,
    });

    const september = await queryLedgerTrends(
      database,
      {
        startMonth: '2026-09',
        endMonth: '2026-09',
        selection: {
          kind: 'SUPER_CATEGORIES',
          superCategories: ['FUN'],
        },
      },
      'GBP',
    );
    const october = await queryLedgerTrends(
      database,
      {
        startMonth: '2026-10',
        endMonth: '2026-10',
        selection: {
          kind: 'SUPER_CATEGORIES',
          superCategories: ['FUN'],
        },
      },
      'GBP',
    );

    expect(september.months[0]?.bars[0]?.actualMinor).toBe(136_420);
    expect(october.months[0]?.bars[0]).toMatchObject({
      actualMinor: 200,
      targetMinor: 0,
    });
  });

  it('partitions mixed currencies and labels currencies omitted from the chart', async () => {
    await insertTransaction(database, {
      id: 'test:usd',
      amountMinor: -5_000,
      currency: 'USD',
      createdAt: '2026-09-15T12:00:00.000Z',
      eventType: 'SPEND',
      categoryId: 'category:coffee',
      offsetId: null,
    });

    const model = await queryLedgerTrends(
      database,
      {
        startMonth: '2026-09',
        endMonth: '2026-09',
        selection: {
          kind: 'CATEGORY',
          categoryId: 'category:coffee',
          categoryName: 'Coffee',
          superCategory: 'FUN',
        },
      },
      'GBP',
    );

    expect(model.months[0]?.bars[0]?.actualMinor).toBe(820);
    expect(model.otherCurrencies).toEqual(['USD']);
  });
});

async function insertBudget(
  database: NodeDatabase,
  month: string,
  baseMinor: number,
  livingBp: number,
  savingBp: number,
  funBp: number,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO monthly_budgets (
      month_key, currency, budget_base_minor, budget_base_mode,
      living_ratio_bp, saving_ratio_bp, fun_ratio_bp,
      living_target_minor, saving_target_minor, fun_target_minor,
      created_at, updated_at
    ) VALUES (?, 'GBP', ?, 'MANUAL', ?, ?, ?, 0, 0, 0, ?, ?);`,
    month,
    baseMinor,
    livingBp,
    savingBp,
    funBp,
    `${month}-01`,
    `${month}-01`,
  );
}

async function insertTransaction(
  database: NodeDatabase,
  input: {
    readonly id: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly createdAt: string;
    readonly eventType: 'SPEND' | 'REFUND';
    readonly categoryId: string | null;
    readonly offsetId: string | null;
  },
): Promise<void> {
  await database.runAsync(
    `INSERT INTO raw_transactions (
      id, source, source_transaction_id, amount_minor, currency, description,
      created_at, raw_payload_json, first_seen_at, last_synced_at
    ) VALUES (?, 'test', ?, ?, ?, ?, ?, '{}', ?, ?);`,
    input.id,
    input.id,
    input.amountMinor,
    input.currency,
    input.id,
    input.createdAt,
    input.createdAt,
    input.createdAt,
  );
  await database.runAsync(
    `INSERT INTO transaction_classifications (
      id, raw_transaction_id, event_type, budget_scope, category_id,
      classification_source, confidence, counts_toward_budget_base,
      offset_raw_transaction_id, active, created_at, updated_at
    ) VALUES (?, ?, ?, 'INCLUDED', ?, 'MANUAL', 'MANUAL', 0, ?, 1, ?, ?);`,
    `${input.id}:classification`,
    input.id,
    input.eventType,
    input.categoryId,
    input.offsetId,
    input.createdAt,
    input.createdAt,
  );
}
