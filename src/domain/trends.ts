import { explainBudgetEffect } from './budget';
import { DomainValidationError } from './errors';
import type { SuperCategoryKey } from './enums';
import { monthQuery, type LedgerQuery } from './query';
import type { Category, ClassifiedTransaction, MonthlyBudget } from './types';
import type { TrendMeasure } from './analytics';

export type TrendSelection =
  | { readonly kind: 'OVERALL' }
  | {
      readonly kind: 'SUPER_CATEGORIES';
      readonly superCategories: readonly SuperCategoryKey[];
    }
  | {
      readonly kind: 'CATEGORY';
      readonly categoryId: string;
      readonly categoryName: string;
      readonly superCategory: SuperCategoryKey;
    };

export interface TrendRequest {
  readonly startMonth: string;
  readonly endMonth: string;
  readonly selection: TrendSelection;
}

export interface TrendSegment {
  readonly id: string;
  readonly label: string;
  readonly amountMinor: number;
  readonly transactionCount: number;
  readonly drillDown: LedgerQuery;
}

export interface TrendBar {
  readonly id: string;
  readonly month: string;
  readonly label: string;
  readonly superCategory: SuperCategoryKey;
  readonly measure: Exclude<TrendMeasure, 'NET_SAVINGS_MOVEMENT'>;
  readonly actualMinor: number;
  readonly targetMinor: number | null;
  readonly transactionCount: number;
  readonly segments: readonly TrendSegment[];
  readonly drillDown: LedgerQuery;
}

export interface TrendMonth {
  readonly month: string;
  readonly bars: readonly TrendBar[];
  readonly netSavingsMovementMinor: number;
  readonly drillDown: LedgerQuery;
}

export interface TrendModel {
  readonly currency: string;
  readonly selection: TrendSelection;
  readonly months: readonly TrendMonth[];
  readonly otherCurrencies: readonly string[];
}

interface CategoryActivity {
  readonly category: Category;
  readonly amountMinor: number;
}

const SUPER_LABELS: Readonly<Record<SuperCategoryKey, string>> = {
  LIVING: 'Living',
  SAVING: 'Saving',
  FUN: 'Fun',
};

export function createTrendModel(
  request: TrendRequest,
  currency: string,
  budgets: readonly MonthlyBudget[],
  transactions: readonly ClassifiedTransaction[],
  resolutionTransactions: readonly ClassifiedTransaction[],
  otherCurrencies: readonly string[] = [],
): TrendModel {
  const months = enumerateMonths(request.startMonth, request.endMonth);
  const budgetByMonth = new Map(
    budgets
      .filter((budget) => budget.currency === currency)
      .map((budget) => [budget.monthKey, budget]),
  );
  const transactionById = new Map(
    resolutionTransactions.map((transaction) => [
      transaction.raw.id,
      transaction,
    ]),
  );

  return {
    currency,
    selection: request.selection,
    otherCurrencies: [...new Set(otherCurrencies)]
      .filter((item) => item !== currency)
      .sort(),
    months: months.map((month) => {
      const monthTransactions = transactions.filter(
        ({ raw }) =>
          raw.currency === currency &&
          !raw.sourceDeleted &&
          raw.createdAt.slice(0, 7) === month,
      );
      const budget = budgetByMonth.get(month) ?? null;
      const bars = selectedSuperCategories(request.selection).map(
        (superCategory) =>
          createBar(
            month,
            superCategory,
            request.selection,
            budget,
            monthTransactions,
            transactionById,
          ),
      );
      const netSavingsMovementMinor = monthTransactions.reduce(
        (total, transaction) => {
          const effect = explainBudgetEffect(transaction, transactionById);
          return addSafe(
            total,
            addSafe(
              effect.savingContributedMinor,
              -effect.savingWithdrawnMinor,
            ),
          );
        },
        0,
      );
      return {
        month,
        bars,
        netSavingsMovementMinor,
        drillDown: monthQuery(month),
      };
    }),
  };
}

export function enumerateMonths(
  startMonth: string,
  endMonth: string,
): readonly string[] {
  assertMonth(startMonth);
  assertMonth(endMonth);
  if (startMonth > endMonth) {
    throw new DomainValidationError(
      'Trend start month must not follow end month.',
    );
  }
  const [startYear, startNumber] = startMonth.split('-').map(Number);
  const [endYear, endNumber] = endMonth.split('-').map(Number);
  if (
    startYear === undefined ||
    startNumber === undefined ||
    endYear === undefined ||
    endNumber === undefined
  ) {
    throw new DomainValidationError('Trend months must use YYYY-MM.');
  }
  const count = (endYear - startYear) * 12 + (endNumber - startNumber) + 1;
  if (count > 120) {
    throw new DomainValidationError('Trend ranges are limited to 120 months.');
  }
  return Array.from({ length: count }, (_, index) => {
    const absoluteMonth = startNumber - 1 + index;
    const year = startYear + Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    return `${year}-${month.toString().padStart(2, '0')}`;
  });
}

export function trendDateRange(request: TrendRequest): {
  readonly startDate: string;
  readonly endDate: string;
} {
  enumerateMonths(request.startMonth, request.endMonth);
  const [year, month] = request.endMonth.split('-').map(Number);
  if (year === undefined || month === undefined) {
    throw new DomainValidationError('Trend months must use YYYY-MM.');
  }
  const lastDay = new Date(Date.UTC(year, month, 0))
    .getUTCDate()
    .toString()
    .padStart(2, '0');
  return {
    startDate: `${request.startMonth}-01`,
    endDate: `${request.endMonth}-${lastDay}`,
  };
}

function createBar(
  month: string,
  superCategory: SuperCategoryKey,
  selection: TrendSelection,
  budget: MonthlyBudget | null,
  transactions: readonly ClassifiedTransaction[],
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
): TrendBar {
  const categoryTotals = new Map<
    string,
    {
      readonly category: Category;
      amountMinor: number;
      readonly transactionIds: Set<string>;
    }
  >();

  for (const transaction of transactions) {
    for (const activity of categoryActivity(transaction, transactionById)) {
      if (
        activity.category.superCategory !== superCategory ||
        (selection.kind === 'CATEGORY' &&
          activity.category.id !== selection.categoryId)
      ) {
        continue;
      }
      const existing = categoryTotals.get(activity.category.id);
      if (existing === undefined) {
        categoryTotals.set(activity.category.id, {
          category: activity.category,
          amountMinor: activity.amountMinor,
          transactionIds: new Set(
            activity.amountMinor === 0 ? [] : [transaction.raw.id],
          ),
        });
      } else {
        existing.amountMinor = addSafe(
          existing.amountMinor,
          activity.amountMinor,
        );
        if (activity.amountMinor !== 0) {
          existing.transactionIds.add(transaction.raw.id);
        }
      }
    }
  }

  const entries = [...categoryTotals.values()]
    .filter(({ transactionIds }) => transactionIds.size > 0)
    .sort(
      (left, right) =>
        Math.abs(right.amountMinor) - Math.abs(left.amountMinor) ||
        left.category.name.localeCompare(right.category.name),
    );
  const segments = entries.map(
    ({ category, amountMinor, transactionIds }): TrendSegment => ({
      id: category.id,
      label: category.name,
      amountMinor,
      transactionCount: transactionIds.size,
      drillDown: monthQuery(month, {
        categoryIds: [category.id],
        scopes: ['INCLUDED'],
      }),
    }),
  );
  const transactionIds = new Set(
    entries.flatMap(({ transactionIds: ids }) => [...ids]),
  );
  const actualMinor = segments.reduce(
    (total, segment) => addSafe(total, segment.amountMinor),
    0,
  );
  const categorySelection =
    selection.kind === 'CATEGORY' ? selection : undefined;

  return {
    id:
      categorySelection === undefined
        ? `${month}:${superCategory}`
        : `${month}:${categorySelection.categoryId}`,
    month,
    label:
      categorySelection === undefined
        ? SUPER_LABELS[superCategory]
        : categorySelection.categoryName,
    superCategory,
    measure:
      superCategory === 'SAVING' ? 'SAVING_CONTRIBUTIONS' : 'INCLUDED_SPENDING',
    actualMinor,
    targetMinor:
      categorySelection === undefined
        ? targetForSuperCategory(budget, superCategory)
        : null,
    transactionCount: transactionIds.size,
    segments,
    drillDown: monthQuery(month, {
      ...(categorySelection === undefined
        ? { superCategories: [superCategory] }
        : { categoryIds: [categorySelection.categoryId] }),
      scopes: ['INCLUDED'],
    }),
  };
}

function categoryActivity(
  transaction: ClassifiedTransaction,
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
): readonly CategoryActivity[] {
  if (transaction.classification.budgetScope === 'EXCLUDED') {
    return [];
  }
  if (transaction.splits.length > 0) {
    const categories = new Map(
      transaction.splitCategories.map((category) => [category.id, category]),
    );
    return transaction.splits.flatMap((split) => {
      const category =
        split.categoryId === null ? null : categories.get(split.categoryId);
      if (
        category === undefined ||
        category === null ||
        split.budgetScope === 'EXCLUDED'
      ) {
        return [];
      }
      const amountMinor = activityAmount(
        split.eventType,
        split.amountMinorAbs,
        category.superCategory,
      );
      return amountMinor === null ? [] : [{ category, amountMinor }];
    });
  }

  const category = effectiveCategory(transaction, transactionById);
  if (category === null) {
    return [];
  }
  const amountMinor = activityAmount(
    transaction.classification.eventType,
    Math.abs(transaction.raw.amountMinor),
    category.superCategory,
  );
  return amountMinor === null ? [] : [{ category, amountMinor }];
}

function effectiveCategory(
  transaction: ClassifiedTransaction,
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
): Category | null {
  if (transaction.category !== null) {
    return transaction.category;
  }
  const offsetId = transaction.classification.offsetRawTransactionId;
  if (offsetId === null) {
    return null;
  }
  const offset = transactionById.get(offsetId);
  if (offset?.category !== null && offset?.category !== undefined) {
    return offset.category;
  }
  return offset?.splitCategories.length === 1
    ? (offset.splitCategories[0] ?? null)
    : null;
}

function activityAmount(
  eventType: ClassifiedTransaction['classification']['eventType'],
  amountMinorAbs: number,
  superCategory: SuperCategoryKey,
): number | null {
  if (eventType === 'SPEND' && superCategory !== 'SAVING') {
    return amountMinorAbs;
  }
  if (eventType === 'SAVING_CONTRIBUTION' && superCategory === 'SAVING') {
    return amountMinorAbs;
  }
  if (
    (eventType === 'REFUND' || eventType === 'REIMBURSEMENT') &&
    superCategory !== 'SAVING'
  ) {
    return -amountMinorAbs;
  }
  return null;
}

function selectedSuperCategories(
  selection: TrendSelection,
): readonly SuperCategoryKey[] {
  if (selection.kind === 'OVERALL') {
    return ['LIVING', 'SAVING', 'FUN'];
  }
  if (selection.kind === 'CATEGORY') {
    return [selection.superCategory];
  }
  const unique = [...new Set(selection.superCategories)];
  if (unique.length === 0) {
    throw new DomainValidationError(
      'Select at least one super-category for Trends.',
    );
  }
  return unique;
}

function targetForSuperCategory(
  budget: MonthlyBudget | null,
  superCategory: SuperCategoryKey,
): number | null {
  if (budget === null) {
    return null;
  }
  if (superCategory === 'LIVING') {
    return budget.livingTargetMinor;
  }
  if (superCategory === 'SAVING') {
    return budget.savingTargetMinor;
  }
  return budget.funTargetMinor;
}

function assertMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new DomainValidationError('Trend months must use YYYY-MM.');
  }
}

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError(
      'Trend money arithmetic exceeded safe range.',
    );
  }
  return result;
}
