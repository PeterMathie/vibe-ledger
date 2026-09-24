import { DomainValidationError } from '../domain/errors';
import type { SuperCategoryKey } from '../domain/enums';
import { formatMoney, money } from '../domain/money';
import { createTrendModel, type TrendBar } from '../domain/trends';
import type { LedgerQuery } from '../domain/query';
import type { ClassifiedTransaction, MonthlyBudget } from '../domain/types';

export type MoneyMapMode = 'PLAN' | 'ACTUAL';

export interface MoneyMapCategory {
  readonly id: string;
  readonly label: string;
  readonly amountMinor: number;
  readonly amountLabel: string;
  readonly direction: 'FORWARD' | 'OFFSET' | 'ZERO';
  readonly hasOffset: boolean;
  readonly width: number;
  readonly drillDown: LedgerQuery;
}

export interface MoneyMapBranch {
  readonly key: SuperCategoryKey;
  readonly label: string;
  readonly measureLabel: string;
  readonly amountMinor: number;
  readonly amountLabel: string;
  readonly targetMinor: number;
  readonly targetLabel: string;
  readonly width: number;
  readonly overflowBasisPoints: number;
  readonly statusLabel: string;
  readonly categories: readonly MoneyMapCategory[];
  readonly drillDown: LedgerQuery;
}

export interface MoneyMapModel {
  readonly mode: MoneyMapMode;
  readonly month: string;
  readonly currency: string;
  readonly budgetBaseMinor: number;
  readonly budgetBaseLabel: string;
  readonly scaleMinor: number;
  readonly branches: readonly MoneyMapBranch[];
  readonly netSavingsMovementMinor: number;
  readonly netSavingsMovementLabel: string;
  readonly otherCurrencies: readonly string[];
  readonly accessibilityRows: readonly string[];
}

const SUPER_LABELS: Readonly<Record<SuperCategoryKey, string>> = {
  LIVING: 'Living',
  SAVING: 'Saving',
  FUN: 'Fun',
};

const BASE_FLOW_WIDTH = 280;
const MAX_FLOW_WIDTH = 50_000;

export function createMoneyMapModel(
  mode: MoneyMapMode,
  budget: MonthlyBudget,
  transactions: readonly ClassifiedTransaction[],
  resolutionTransactions: readonly ClassifiedTransaction[],
  otherCurrencies: readonly string[] = [],
  locale = 'en-GB',
): MoneyMapModel {
  const trend = createTrendModel(
    {
      startMonth: budget.monthKey,
      endMonth: budget.monthKey,
      selection: { kind: 'OVERALL' },
    },
    budget.currency,
    [budget],
    transactions,
    resolutionTransactions,
    otherCurrencies,
  );
  const month = trend.months[0];
  if (month === undefined) {
    throw new DomainValidationError('Money Map month is unavailable.');
  }
  const scaleMinor = Math.max(1, budget.budgetBaseMinor);
  const offsetCategoryIds = collectOffsetCategoryIds(
    transactions,
    resolutionTransactions,
  );
  const branches = month.bars.map((bar) =>
    createBranch(
      mode,
      bar,
      scaleMinor,
      budget.currency,
      locale,
      offsetCategoryIds,
    ),
  );
  const budgetBaseLabel = formatMinor(
    budget.budgetBaseMinor,
    budget.currency,
    locale,
  );
  const netSavingsMovementLabel = formatMinor(
    month.netSavingsMovementMinor,
    budget.currency,
    locale,
  );

  return {
    mode,
    month: budget.monthKey,
    currency: budget.currency,
    budgetBaseMinor: budget.budgetBaseMinor,
    budgetBaseLabel,
    scaleMinor,
    branches,
    netSavingsMovementMinor: month.netSavingsMovementMinor,
    netSavingsMovementLabel,
    otherCurrencies: trend.otherCurrencies,
    accessibilityRows: [
      `Budget base, ${budgetBaseLabel}`,
      ...branches.flatMap((branch) => [
        `${branch.label}, ${branch.measureLabel}, ${branch.amountLabel}, target ${branch.targetLabel}, ${branch.statusLabel}`,
        ...branch.categories.map(
          (category) =>
            `${branch.label}, ${category.label}, ${category.amountLabel}, ${
              category.direction === 'OFFSET'
                ? 'refund or reimbursement offset'
                : category.hasOffset
                  ? 'net activity after refund or reimbursement offset'
                  : category.direction === 'ZERO'
                    ? 'net zero category activity'
                    : branch.measureLabel
            }`,
        ),
      ]),
      `Net savings movement, ${netSavingsMovementLabel}, displayed separately from saving contributions`,
    ],
  };
}

export function proportionalFlowWidth(
  amountMinor: number,
  scaleMinor: number,
): number {
  if (
    !Number.isSafeInteger(amountMinor) ||
    !Number.isSafeInteger(scaleMinor) ||
    scaleMinor <= 0
  ) {
    throw new DomainValidationError(
      'Money Map geometry requires safe integer amounts and a positive scale.',
    );
  }
  const scaledWidth =
    (BigInt(Math.abs(amountMinor)) * BigInt(BASE_FLOW_WIDTH * 1_000)) /
    BigInt(scaleMinor);
  const width = Number(scaledWidth) / 1_000;
  return Math.min(MAX_FLOW_WIDTH, width);
}

function createBranch(
  mode: MoneyMapMode,
  bar: TrendBar,
  scaleMinor: number,
  currency: string,
  locale: string,
  offsetCategoryIds: ReadonlySet<string>,
): MoneyMapBranch {
  const targetMinor = bar.targetMinor ?? 0;
  const amountMinor = mode === 'PLAN' ? targetMinor : bar.actualMinor;
  const difference = targetMinor - amountMinor;
  const categories =
    mode === 'PLAN'
      ? []
      : bar.segments.map((segment) => ({
          id: segment.id,
          label: segment.label,
          amountMinor: segment.amountMinor,
          amountLabel: formatMinor(segment.amountMinor, currency, locale),
          hasOffset: offsetCategoryIds.has(segment.id),
          direction:
            segment.amountMinor < 0
              ? ('OFFSET' as const)
              : segment.amountMinor > 0
                ? ('FORWARD' as const)
                : ('ZERO' as const),
          width: proportionalFlowWidth(segment.amountMinor, scaleMinor),
          drillDown: segment.drillDown,
        }));

  return {
    key: bar.superCategory,
    label: SUPER_LABELS[bar.superCategory],
    measureLabel:
      mode === 'PLAN'
        ? 'allocation target'
        : bar.measure === 'SAVING_CONTRIBUTIONS'
          ? 'saving contributions'
          : 'included spending',
    amountMinor,
    amountLabel: formatMinor(amountMinor, currency, locale),
    targetMinor,
    targetLabel: formatMinor(targetMinor, currency, locale),
    width: proportionalFlowWidth(amountMinor, scaleMinor),
    overflowBasisPoints:
      targetMinor <= 0
        ? amountMinor > 0
          ? 10_001
          : 0
        : roundedBasisPoints(amountMinor, targetMinor),
    statusLabel:
      amountMinor < 0
        ? `${formatMinor(Math.abs(amountMinor), currency, locale)} net refund / reimbursement offset`
        : targetMinor === 0
          ? amountMinor === 0
            ? 'No target set; no activity'
            : 'No target set; activity shown at budget-base scale'
          : difference >= 0
            ? `${formatMinor(difference, currency, locale)} ${bar.superCategory === 'SAVING' ? 'to go' : 'left'}`
            : `${formatMinor(-difference, currency, locale)} over target`,
    categories,
    drillDown: bar.drillDown,
  };
}

function collectOffsetCategoryIds(
  transactions: readonly ClassifiedTransaction[],
  resolutionTransactions: readonly ClassifiedTransaction[],
): ReadonlySet<string> {
  const byId = new Map(
    resolutionTransactions.map((transaction) => [
      transaction.raw.id,
      transaction,
    ]),
  );
  const result = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.classification.budgetScope !== 'INCLUDED') {
      continue;
    }
    for (const split of transaction.splits) {
      if (
        split.budgetScope === 'INCLUDED' &&
        (split.eventType === 'REFUND' || split.eventType === 'REIMBURSEMENT') &&
        split.categoryId !== null
      ) {
        result.add(split.categoryId);
      }
    }
    if (
      transaction.splits.length > 0 ||
      (transaction.classification.eventType !== 'REFUND' &&
        transaction.classification.eventType !== 'REIMBURSEMENT')
    ) {
      continue;
    }
    if (transaction.classification.categoryId !== null) {
      result.add(transaction.classification.categoryId);
      continue;
    }
    const offsetId = transaction.classification.offsetRawTransactionId;
    const offset = offsetId === null ? undefined : byId.get(offsetId);
    if (offset?.category !== null && offset?.category !== undefined) {
      result.add(offset.category.id);
    } else if (offset?.splitCategories.length === 1) {
      const category = offset.splitCategories[0];
      if (category !== undefined) {
        result.add(category.id);
      }
    }
  }
  return result;
}

function roundedBasisPoints(numerator: number, denominator: number): number {
  const scaled = BigInt(numerator) * 10_000n;
  const divisor = BigInt(denominator);
  const rounded =
    scaled >= 0n
      ? (scaled + divisor / 2n) / divisor
      : (scaled - divisor / 2n) / divisor;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError(
      'Money Map target comparison exceeded safe range.',
    );
  }
  return result;
}

function formatMinor(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return formatMoney(money(amountMinor, currency), locale);
}
