import { describe, expect, it } from 'vitest';

import {
  calculateMonthlyBudget,
  createMonthlyBudget,
} from '../src/domain/budget';
import type {
  Category,
  Classification,
  ClassifiedTransaction,
  RawTransaction,
  TransactionSplit,
} from '../src/domain/types';

const RATIOS = { LIVING: 5_000, SAVING: 3_000, FUN: 2_000 } as const;

const categories = {
  coffee: category('coffee', 'Coffee', 'FUN'),
  rent: category('rent', 'Rent', 'LIVING'),
  groceries: category('groceries', 'Groceries', 'LIVING'),
  party: category('party', 'Nights out', 'FUN'),
  shopping: category('shopping', 'Shopping', 'FUN'),
  restaurants: category('restaurants', 'Restaurants', 'FUN'),
  investments: category('investments', 'Investments', 'SAVING'),
  house: category('house', 'House saving', 'SAVING'),
} as const;

describe('Phase 0 executable acceptance scenarios', () => {
  it('A1/A2 ordinary spending changes only its allocation and heat map', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [
        transaction('salary', 300_000, 'INCOME', null, {
          countsTowardBudgetBase: true,
        }),
        transaction('coffee', -420, 'SPEND', categories.coffee, {
          day: '02',
        }),
        transaction('rent', -90_000, 'SPEND', categories.rent, { day: '03' }),
      ],
      RATIOS,
    );

    expect(summary).toMatchObject({
      budgetBaseMinor: 300_000,
      livingTargetMinor: 150_000,
      savingTargetMinor: 90_000,
      funTargetMinor: 60_000,
      livingActualMinor: 90_000,
      funActualMinor: 420,
      savingContributedMinor: 0,
      includedSpendingMinor: 90_420,
      dailyIncludedSpendMinor: {
        '2026-09-02': 420,
        '2026-09-03': 90_000,
      },
    });
  });

  it('A3 aggregates exact split portions instead of the parent', () => {
    const tesco = transaction('tesco', -7_000, 'SPEND', null, {
      splits: [
        split('tesco-living', 'tesco', 5_500, categories.groceries),
        split('tesco-fun', 'tesco', 1_500, categories.party),
      ],
      splitCategories: [categories.groceries, categories.party],
    });

    const summary = calculateMonthlyBudget('2026-09', 'GBP', [tesco], RATIOS);

    expect(summary.livingActualMinor).toBe(5_500);
    expect(summary.funActualMinor).toBe(1_500);
    expect(summary.dailyIncludedSpendMinor['2026-09-01']).toBe(7_000);
  });

  it('A3 rejects aggregation when split portions do not conserve the raw amount', () => {
    const invalid = transaction('invalid-split', -7_000, 'SPEND', null, {
      splits: [
        split('invalid-living', 'invalid-split', 5_500, categories.groceries),
        split('invalid-fun', 'invalid-split', 1_499, categories.party),
      ],
      splitCategories: [categories.groceries, categories.party],
    });

    expect(() =>
      calculateMonthlyBudget('2026-09', 'GBP', [invalid], RATIOS),
    ).toThrow('expected 7000');
  });

  it('B1/B2 gives pot and ISA saving contributions the same budget effect', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [
        transaction(
          'house-pot',
          -20_000,
          'SAVING_CONTRIBUTION',
          categories.house,
        ),
        transaction(
          'moneybox',
          -20_000,
          'SAVING_CONTRIBUTION',
          categories.investments,
        ),
      ],
      RATIOS,
    );

    expect(summary.savingContributedMinor).toBe(40_000);
    expect(summary.includedSpendingMinor).toBe(0);
    expect(summary.dailyIncludedSpendMinor).toEqual({});
  });

  it('B3/D2 never turns a savings withdrawal into income or spending', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [transaction('withdrawal', 600_000, 'SAVING_WITHDRAWAL', null)],
      RATIOS,
    );

    expect(summary).toMatchObject({
      budgetBaseMinor: 0,
      livingActualMinor: 0,
      funActualMinor: 0,
      savingWithdrawnMinor: 600_000,
      netSavingsMovementMinor: -600_000,
    });
  });

  it('B4 keeps gross saving progress when an equal amount is withdrawn', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [
        transaction('save', -90_000, 'SAVING_CONTRIBUTION', categories.house),
        transaction('withdraw', 90_000, 'SAVING_WITHDRAWAL', null),
      ],
      RATIOS,
      300_000,
    );

    expect(summary.savingTargetMinor).toBe(90_000);
    expect(summary.savingContributedMinor).toBe(90_000);
    expect(summary.netSavingsMovementMinor).toBe(0);
    expect(summary.includedSpendingMinor).toBe(0);
  });

  it('B5 reports target progress and negative net movement separately', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [
        transaction('save', -90_000, 'SAVING_CONTRIBUTION', categories.house),
        transaction('withdraw', 500_000, 'SAVING_WITHDRAWAL', null),
      ],
      RATIOS,
      300_000,
    );

    expect(summary.savingContributedMinor).toBe(90_000);
    expect(summary.savingTargetMinor).toBe(90_000);
    expect(summary.netSavingsMovementMinor).toBe(-410_000);
  });

  it('C1 makes internal transfers neutral and explains why', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [transaction('own-transfer', -30_000, 'INTERNAL_TRANSFER', null)],
      RATIOS,
    );

    expect(summary.includedSpendingMinor).toBe(0);
    expect(summary.effects[0]?.reason).toBe(
      'Internal transfer has no budget effect.',
    );
  });

  it('D1/D3 includes only opted-in income in the budget base', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [
        transaction('salary', 300_000, 'INCOME', null, {
          countsTowardBudgetBase: true,
        }),
        transaction('sale', 50_000, 'INCOME', null, {
          countsTowardBudgetBase: true,
        }),
        transaction('gift', 20_000, 'INCOME', null),
      ],
      RATIOS,
    );

    expect(summary.budgetBaseMinor).toBe(350_000);
    expect(summary.livingTargetMinor).toBe(175_000);
  });

  it('E1 links a refund to its original category without creating income', () => {
    const spend = transaction(
      'clothing',
      -12_000,
      'SPEND',
      categories.shopping,
    );
    const refund = transaction('refund', 12_000, 'REFUND', null, {
      offsetRawTransactionId: 'clothing',
    });
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [spend, refund],
      RATIOS,
    );

    expect(summary.funActualMinor).toBe(0);
    expect(summary.budgetBaseMinor).toBe(0);
  });

  it('E1 cross-month refund can produce negative current-month category activity', () => {
    const augustSpend = transaction(
      'august-clothing',
      -12_000,
      'SPEND',
      categories.shopping,
      { month: '2026-08' },
    );
    const septemberRefund = transaction(
      'september-refund',
      12_000,
      'REFUND',
      null,
      { offsetRawTransactionId: 'august-clothing' },
    );
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [augustSpend, septemberRefund],
      RATIOS,
    );

    expect(summary.funActualMinor).toBe(-12_000);
  });

  it('E2 links a reimbursement and exposes the net restaurant cost', () => {
    const dinner = transaction(
      'dinner',
      -8_000,
      'SPEND',
      categories.restaurants,
    );
    const reimbursement = transaction(
      'reimbursement',
      4_000,
      'REIMBURSEMENT',
      null,
      { offsetRawTransactionId: 'dinner' },
    );
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [dinner, reimbursement],
      RATIOS,
    );

    expect(summary.funActualMinor).toBe(4_000);
  });

  it('F1 keeps explicitly excluded spend out of all primary aggregates', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [
        transaction('hotel', -70_000, 'SPEND', categories.shopping, {
          budgetScope: 'EXCLUDED',
        }),
      ],
      RATIOS,
    );

    expect(summary.funActualMinor).toBe(0);
    expect(summary.dailyIncludedSpendMinor).toEqual({});
    expect(summary.effects[0]?.reason).toBe(
      'Excluded by explicit budget scope.',
    );
  });

  it('F2 classifies spending independently of funding provenance', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [transaction('holiday-coffee', -400, 'SPEND', categories.coffee)],
      RATIOS,
    );
    expect(summary.funActualMinor).toBe(400);
  });

  it('H5 gives a saving-only day zero heat-map spending', () => {
    const summary = calculateMonthlyBudget(
      '2026-09',
      'GBP',
      [transaction('save', -90_000, 'SAVING_CONTRIBUTION', categories.house)],
      RATIOS,
    );
    expect(summary.dailyIncludedSpendMinor).toEqual({});
  });

  it('L1 preserves stored historical targets when later ratios change', () => {
    const september = createMonthlyBudget(
      '2026-09',
      'GBP',
      300_000,
      RATIOS,
      '2026-09-01T00:00:00.000Z',
    );
    const october = createMonthlyBudget(
      '2026-10',
      'GBP',
      300_000,
      { LIVING: 5_000, SAVING: 2_500, FUN: 2_500 },
      '2026-10-01T00:00:00.000Z',
    );

    expect(september).toMatchObject({
      savingTargetMinor: 90_000,
      funTargetMinor: 60_000,
    });
    expect(october).toMatchObject({
      savingTargetMinor: 75_000,
      funTargetMinor: 75_000,
    });
  });
});

interface TransactionOptions {
  readonly month?: string;
  readonly day?: string;
  readonly budgetScope?: Classification['budgetScope'];
  readonly countsTowardBudgetBase?: boolean;
  readonly offsetRawTransactionId?: string;
  readonly splits?: readonly TransactionSplit[];
  readonly splitCategories?: readonly Category[];
}

function transaction(
  id: string,
  amountMinor: number,
  eventType: Classification['eventType'],
  assignedCategory: Category | null,
  options: TransactionOptions = {},
): ClassifiedTransaction {
  const createdAt = `${options.month ?? '2026-09'}-${options.day ?? '01'}T12:00:00.000Z`;
  const raw: RawTransaction = {
    id,
    source: 'fixture',
    sourceTransactionId: id,
    sourceAccountId: null,
    amountMinor,
    currency: 'GBP',
    description: id,
    merchantId: null,
    merchantName: null,
    sourceCategory: null,
    createdAt,
    settledAt: createdAt,
    rawPayloadJson: '{}',
    firstSeenAt: createdAt,
    lastSyncedAt: createdAt,
    sourceDeleted: false,
  };
  return {
    raw,
    classification: {
      id: `classification:${id}`,
      rawTransactionId: id,
      eventType,
      budgetScope: options.budgetScope ?? 'INCLUDED',
      categoryId: assignedCategory?.id ?? null,
      classificationSource: 'MANUAL',
      confidence: 'MANUAL',
      countsTowardBudgetBase: options.countsTowardBudgetBase ?? false,
      offsetRawTransactionId: options.offsetRawTransactionId ?? null,
      note: null,
      createdAt,
      updatedAt: createdAt,
    },
    category: assignedCategory,
    splits: options.splits ?? [],
    splitCategories: options.splitCategories ?? [],
  };
}

function category(
  id: string,
  name: string,
  superCategory: Category['superCategory'],
): Category {
  return {
    id,
    name,
    superCategory,
    defaultBudgetScope: 'INCLUDED',
  };
}

function split(
  id: string,
  rawTransactionId: string,
  amountMinorAbs: number,
  assignedCategory: Category,
): TransactionSplit {
  return {
    id,
    rawTransactionId,
    amountMinorAbs,
    eventType: 'SPEND',
    budgetScope: 'INCLUDED',
    categoryId: assignedCategory.id,
    classificationSource: 'MANUAL',
    note: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  };
}
