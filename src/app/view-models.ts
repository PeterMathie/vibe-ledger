import {
  explainBudgetEffect,
  type MonthlyBudgetSummary,
} from '../domain/budget';
import type { SuperCategoryKey } from '../domain/enums';
import { formatMoney, money } from '../domain/money';
import type { LedgerQuery } from '../domain/query';
import type { ClassifiedTransaction, MonthlyBudget } from '../domain/types';

export type ExplorerFilter = LedgerQuery;

export interface HomeCardViewModel {
  readonly key: SuperCategoryKey;
  readonly title: string;
  readonly actualLabel: string;
  readonly targetLabel: string;
  readonly actualMinor: number;
  readonly targetMinor: number;
  readonly ratioLabel: string;
  readonly ratioBasisPoints: number;
  readonly statusLabel: string;
  readonly percentageLabel: string;
  readonly isOver: boolean;
  readonly filter: ExplorerFilter;
  readonly secondaryLabel?: string;
}

export interface HomeViewModel {
  readonly monthKey: string;
  readonly monthLabel: string;
  readonly budgetBaseLabel: string;
  readonly allocationLabel: string;
  readonly needsReviewLabel: string | null;
  readonly cards: readonly HomeCardViewModel[];
}

export interface ExplorerTransactionViewModel {
  readonly id: string;
  readonly description: string;
  readonly dateLabel: string;
  readonly amountLabel: string;
  readonly categoryLabel: string;
  readonly superCategoryLabel: string;
  readonly typeLabel: string;
  readonly scopeLabel: string;
  readonly confidenceLabel: string | null;
}

export interface ExplorerBreakdownViewModel {
  readonly key: string;
  readonly label: string;
  readonly superCategory: SuperCategoryKey;
  readonly amountMinor: number;
  readonly amountLabel: string;
  readonly percentageLabel: string;
  readonly transactions: readonly ExplorerTransactionViewModel[];
}

export interface ExplorerSuperCategoryViewModel {
  readonly key: SuperCategoryKey;
  readonly label: string;
  readonly amountLabel: string;
  readonly percentageLabel: string;
  readonly categories: readonly ExplorerBreakdownViewModel[];
}

export interface ExplorerViewModel {
  readonly title: string;
  readonly periodLabel: string;
  readonly includedSpendLabel: string;
  readonly excludedSpendLabel: string | null;
  readonly transactionCountLabel: string;
  readonly breakdown: readonly ExplorerBreakdownViewModel[];
  readonly superCategories: readonly ExplorerSuperCategoryViewModel[];
  readonly transactions: readonly ExplorerTransactionViewModel[];
}

const SUPER_CATEGORY_LABELS: Readonly<Record<SuperCategoryKey, string>> = {
  LIVING: 'Living',
  SAVING: 'Saving',
  FUN: 'Fun',
};

const EVENT_TYPE_LABELS = {
  INCOME: 'Income',
  SPEND: 'Purchase',
  SAVING_CONTRIBUTION: 'Put into savings',
  SAVING_WITHDRAWAL: 'Taken from savings',
  INTERNAL_TRANSFER: 'Transfer between my accounts',
  REFUND: 'Refund',
  REIMBURSEMENT: 'Reimbursement',
  DEBT_PAYMENT: 'Credit-card payment',
  NEUTRAL: 'Ignore / neutral',
} as const;

export function createHomeViewModel(
  budget: MonthlyBudget,
  summary: MonthlyBudgetSummary,
  transactions: readonly ClassifiedTransaction[],
  locale = 'en-GB',
): HomeViewModel {
  const currency = budget.currency;
  const needsReview = transactions.filter(
    ({ classification }) => classification.confidence === 'LOW',
  ).length;
  const cards: readonly HomeCardViewModel[] = [
    createCard(
      'LIVING',
      summary.livingActualMinor,
      budget.livingTargetMinor,
      budget.monthKey,
      currency,
      locale,
      budget.livingRatioBp,
    ),
    createCard(
      'SAVING',
      summary.savingContributedMinor,
      budget.savingTargetMinor,
      budget.monthKey,
      currency,
      locale,
      budget.savingRatioBp,
      `Net savings movement ${formatMinor(summary.netSavingsMovementMinor, currency, locale)}`,
    ),
    createCard(
      'FUN',
      summary.funActualMinor,
      budget.funTargetMinor,
      budget.monthKey,
      currency,
      locale,
      budget.funRatioBp,
    ),
  ];

  return {
    monthKey: budget.monthKey,
    monthLabel: formatMonth(budget.monthKey, locale),
    budgetBaseLabel: formatMinor(budget.budgetBaseMinor, currency, locale),
    allocationLabel: `Living ${formatBasisPoints(budget.livingRatioBp)} · Saving ${formatBasisPoints(budget.savingRatioBp)} · Fun ${formatBasisPoints(budget.funRatioBp)}`,
    needsReviewLabel:
      needsReview === 0
        ? null
        : `${needsReview} synthetic transaction${needsReview === 1 ? ' needs' : 's need'} review`,
    cards,
  };
}

export function createExplorerViewModel(
  transactions: readonly ClassifiedTransaction[],
  resolutionTransactions: readonly ClassifiedTransaction[],
  filter: LedgerQuery,
  currency: string,
  locale = 'en-GB',
): ExplorerViewModel {
  const byId = new Map(
    resolutionTransactions.map((transaction) => [
      transaction.raw.id,
      transaction,
    ]),
  );
  let includedSpendMinor = 0;
  let excludedSpendMinor = 0;
  const categoryTotals = new Map<
    string,
    {
      label: string;
      superCategory: SuperCategoryKey;
      amountMinor: number;
      transactionIds: Set<string>;
    }
  >();

  for (const transaction of transactions) {
    if (transaction.classification.budgetScope === 'EXCLUDED') {
      excludedSpendMinor = addSafe(
        excludedSpendMinor,
        transaction.classification.eventType === 'SPEND'
          ? Math.abs(transaction.raw.amountMinor)
          : 0,
      );
      continue;
    }
    excludedSpendMinor = addSafe(
      excludedSpendMinor,
      transaction.splits.reduce(
        (total, split) =>
          addSafe(
            total,
            split.budgetScope === 'EXCLUDED' && split.eventType === 'SPEND'
              ? split.amountMinorAbs
              : 0,
          ),
        0,
      ),
    );
    const effect = explainBudgetEffect(transaction, byId);
    const contributions = categoryContributions(transaction, byId).filter(
      (contribution) =>
        (filter.categoryIds === undefined ||
          filter.categoryIds.includes(contribution.key)) &&
        (filter.superCategories === undefined ||
          filter.superCategories.includes(contribution.superCategory)),
    );
    includedSpendMinor = addSafe(
      includedSpendMinor,
      filter.categoryIds === undefined && filter.superCategories === undefined
        ? effect.includedSpendingMinor
        : contributions.reduce(
            (total, contribution) =>
              addSafe(total, contribution.spendEffectMinor),
            0,
          ),
    );
    for (const contribution of contributions) {
      if (contribution.amountMinor === 0) {
        continue;
      }
      const existing = categoryTotals.get(contribution.key);
      categoryTotals.set(contribution.key, {
        label: contribution.label,
        superCategory: contribution.superCategory,
        amountMinor: addSafe(
          existing?.amountMinor ?? 0,
          contribution.amountMinor,
        ),
        transactionIds: new Set([
          ...(existing?.transactionIds ?? []),
          transaction.raw.id,
        ]),
      });
    }
  }

  const transactionRows = transactions.map((transaction) =>
    transactionRow(transaction, byId, locale),
  );
  const transactionRowsById = new Map(
    transactionRows.map((transaction) => [transaction.id, transaction]),
  );
  const breakdown = [...categoryTotals.entries()]
    .sort(
      ([, left], [, right]) =>
        Math.abs(right.amountMinor) - Math.abs(left.amountMinor) ||
        left.label.localeCompare(right.label),
    )
    .map(([key, item]) => ({
      key,
      label: item.label,
      superCategory: item.superCategory,
      amountMinor: item.amountMinor,
      amountLabel: formatMinor(item.amountMinor, currency, locale),
      percentageLabel: '',
      transactions: [...item.transactionIds].flatMap((id) => {
        const transaction = transactionRowsById.get(id);
        return transaction === undefined ? [] : [transaction];
      }),
    }));
  const superOrder: readonly SuperCategoryKey[] = ['LIVING', 'SAVING', 'FUN'];
  const superTotals = new Map(
    superOrder.map((key) => [
      key,
      breakdown
        .filter(({ superCategory }) => superCategory === key)
        .reduce(
          (total, category) => addSafe(total, Math.abs(category.amountMinor)),
          0,
        ),
    ]),
  );
  const overallTotal = [...superTotals.values()].reduce(addSafe, 0);
  const superCategories = superOrder.flatMap((key) => {
    const total = superTotals.get(key) ?? 0;
    const categories = breakdown
      .filter(({ superCategory }) => superCategory === key)
      .map((category) => ({
        ...category,
        percentageLabel: formatRatio(Math.abs(category.amountMinor), total),
      }));
    if (
      categories.length === 0 &&
      filter.superCategories !== undefined &&
      !filter.superCategories.includes(key)
    ) {
      return [];
    }
    return [
      {
        key,
        label: SUPER_CATEGORY_LABELS[key],
        amountLabel: formatMinor(total, currency, locale),
        percentageLabel: formatRatio(total, overallTotal),
        categories,
      },
    ];
  });

  return {
    title: explorerTitle(filter),
    periodLabel: formatPeriod(filter.date, locale),
    includedSpendLabel: formatMinor(includedSpendMinor, currency, locale),
    excludedSpendLabel:
      excludedSpendMinor === 0
        ? null
        : formatMinor(excludedSpendMinor, currency, locale),
    transactionCountLabel: `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`,
    breakdown,
    superCategories,
    transactions: transactionRows,
  };
}

function createCard(
  key: SuperCategoryKey,
  actualMinor: number,
  targetMinor: number,
  month: string,
  currency: string,
  locale: string,
  ratioBp: number,
  secondaryLabel?: string,
): HomeCardViewModel {
  const difference = addSafe(targetMinor, -actualMinor);
  const isOver = difference < 0;
  return {
    key,
    title: SUPER_CATEGORY_LABELS[key],
    actualLabel: formatMinor(actualMinor, currency, locale),
    targetLabel: formatMinor(targetMinor, currency, locale),
    actualMinor,
    targetMinor,
    ratioLabel: formatBasisPoints(ratioBp),
    ratioBasisPoints: ratioBp,
    statusLabel:
      difference >= 0
        ? `${formatMinor(difference, currency, locale)} ${key === 'SAVING' ? 'to go' : 'left'}`
        : `${formatMinor(-difference, currency, locale)} over`,
    percentageLabel: formatRatio(actualMinor, targetMinor),
    isOver,
    filter: {
      date: { kind: 'MONTH', month },
      superCategories: [key],
    },
    ...(secondaryLabel === undefined ? {} : { secondaryLabel }),
  };
}

function transactionRow(
  transaction: ClassifiedTransaction,
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
  locale: string,
): ExplorerTransactionViewModel {
  const categories = effectiveCategories(transaction, transactionById);
  const categoryLabel =
    transaction.splits.length > 0
      ? `Split: ${transaction.splitCategories.map(({ name }) => name).join(' + ')}`
      : (categories[0]?.name ?? 'Uncategorised');
  const superCategories = [
    ...new Set(categories.map(({ superCategory }) => superCategory)),
  ];
  return {
    id: transaction.raw.id,
    description: transaction.raw.merchantName ?? transaction.raw.description,
    dateLabel: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(transaction.raw.createdAt)),
    amountLabel: formatMinor(
      Math.abs(transaction.raw.amountMinor),
      transaction.raw.currency,
      locale,
    ),
    categoryLabel,
    superCategoryLabel:
      superCategories.length === 0
        ? 'No allocation'
        : superCategories.map((key) => SUPER_CATEGORY_LABELS[key]).join(' + '),
    typeLabel: EVENT_TYPE_LABELS[transaction.classification.eventType],
    scopeLabel: transactionScopeLabel(transaction),
    confidenceLabel:
      transaction.classification.confidence === 'LOW' ? 'Needs review' : null,
  };
}

function transactionScopeLabel(
  transaction: ClassifiedTransaction,
): ExplorerTransactionViewModel['scopeLabel'] {
  if (transaction.classification.budgetScope === 'EXCLUDED') {
    return 'Excluded from budget';
  }
  const excludedSplits = transaction.splits.filter(
    ({ budgetScope }) => budgetScope === 'EXCLUDED',
  ).length;
  if (excludedSplits === 0) {
    return 'Included in budget';
  }
  return excludedSplits === transaction.splits.length
    ? 'Excluded from budget'
    : 'Partly excluded from budget';
}

function categoryContributions(
  transaction: ClassifiedTransaction,
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
): readonly {
  readonly key: string;
  readonly label: string;
  readonly superCategory: SuperCategoryKey;
  readonly amountMinor: number;
  readonly spendEffectMinor: number;
}[] {
  const { classification, splits } = transaction;
  if (splits.length > 0) {
    const categories = new Map(
      transaction.splitCategories.map((category) => [category.id, category]),
    );
    return splits.flatMap((split) => {
      const category =
        split.categoryId === null ? null : categories.get(split.categoryId);
      if (category === undefined || category === null) {
        return [];
      }
      return [
        {
          key: category.id,
          label: category.name,
          superCategory: category.superCategory,
          amountMinor:
            split.budgetScope !== 'INCLUDED'
              ? 0
              : split.eventType === 'REFUND' ||
                  split.eventType === 'REIMBURSEMENT'
                ? -split.amountMinorAbs
                : split.eventType === 'SPEND' ||
                    split.eventType === 'SAVING_CONTRIBUTION'
                  ? split.amountMinorAbs
                  : 0,
          spendEffectMinor:
            split.budgetScope === 'INCLUDED' && split.eventType === 'SPEND'
              ? split.amountMinorAbs
              : 0,
        },
      ];
    });
  }

  const category = effectiveCategories(transaction, transactionById)[0];
  if (category === undefined) {
    return [];
  }
  const absoluteAmount = Math.abs(transaction.raw.amountMinor);
  const amountMinor =
    classification.eventType === 'REFUND' ||
    classification.eventType === 'REIMBURSEMENT'
      ? -absoluteAmount
      : classification.eventType === 'SPEND' ||
          classification.eventType === 'SAVING_CONTRIBUTION'
        ? absoluteAmount
        : 0;
  const spendEffectMinor =
    classification.eventType === 'SPEND' ||
    classification.eventType === 'REFUND' ||
    classification.eventType === 'REIMBURSEMENT'
      ? amountMinor
      : 0;
  return [
    {
      key: category.id,
      label: category.name,
      superCategory: category.superCategory,
      amountMinor,
      spendEffectMinor,
    },
  ];
}

function effectiveCategories(
  transaction: ClassifiedTransaction,
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
): readonly NonNullable<ClassifiedTransaction['category']>[] {
  if (transaction.splits.length > 0) {
    return transaction.splitCategories;
  }
  if (transaction.category !== null) {
    return [transaction.category];
  }
  const offsetId = transaction.classification.offsetRawTransactionId;
  const offsetCategory =
    offsetId === null ? null : transactionById.get(offsetId)?.category;
  return offsetCategory === undefined || offsetCategory === null
    ? []
    : [offsetCategory];
}

function explorerTitle(filter: ExplorerFilter): string {
  if (filter.categoryIds !== undefined) {
    return 'Category details';
  }
  if (filter.superCategories?.length === 1) {
    const key = filter.superCategories[0];
    return key === undefined
      ? 'Breakdown'
      : `${SUPER_CATEGORY_LABELS[key]} details`;
  }
  if (filter.date.kind === 'DAY') {
    return 'Day details';
  }
  return 'Breakdown';
}

function formatPeriod(date: LedgerQuery['date'], locale: string): string {
  if (date.kind === 'DAY') {
    return date.date;
  }
  if (date.kind === 'MONTH') {
    return formatMonth(date.month, locale);
  }
  return `${date.startDate} – ${date.endDate}`;
}

function formatMinor(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return formatMoney(money(amountMinor, currency), locale);
}

function formatBasisPoints(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = basisPoints % 100;
  return fraction === 0
    ? `${whole}%`
    : `${whole}.${fraction.toString().padStart(2, '0').replace(/0$/, '')}%`;
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return 'No target set';
  }
  const scaled = BigInt(numerator) * 1_000n;
  const divisor = BigInt(denominator);
  const tenths =
    scaled >= 0n
      ? (scaled + divisor / 2n) / divisor
      : (scaled - divisor / 2n) / divisor;
  const whole = tenths / 10n;
  const fraction = tenths < 0n ? -(tenths % 10n) : tenths % 10n;
  return fraction === 0n ? `${whole}%` : `${whole}.${fraction}%`;
}

function formatMonth(monthKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error('View model money arithmetic exceeded safe range.');
  }
  return result;
}
