import { DomainValidationError } from './errors';
import type { SuperCategoryKey } from './enums';
import { allocateByBasisPoints, money } from './money';
import { validateSplits } from './classification';
import type {
  Category,
  Classification,
  ClassifiedTransaction,
  MonthlyBudget,
} from './types';

export interface AllocationRatios {
  readonly LIVING: number;
  readonly SAVING: number;
  readonly FUN: number;
}

export interface BudgetEffect {
  readonly rawTransactionId: string;
  readonly budgetBaseMinor: number;
  readonly livingActualMinor: number;
  readonly funActualMinor: number;
  readonly savingContributedMinor: number;
  readonly savingWithdrawnMinor: number;
  readonly includedSpendingMinor: number;
  readonly heatMapSpendMinor: number;
  readonly reason: string;
}

export interface MonthlyBudgetSummary {
  readonly monthKey: string;
  readonly currency: string;
  readonly budgetBaseMinor: number;
  readonly livingTargetMinor: number;
  readonly savingTargetMinor: number;
  readonly funTargetMinor: number;
  readonly livingActualMinor: number;
  readonly funActualMinor: number;
  readonly includedSpendingMinor: number;
  readonly savingContributedMinor: number;
  readonly savingWithdrawnMinor: number;
  readonly netSavingsMovementMinor: number;
  readonly dailyIncludedSpendMinor: Readonly<Record<string, number>>;
  readonly effects: readonly BudgetEffect[];
}

interface EffectivePortion {
  readonly amountMinorAbs: number;
  readonly eventType: Classification['eventType'];
  readonly budgetScope: Classification['budgetScope'];
  readonly category: Category | null;
}

export function createMonthlyBudget(
  monthKey: string,
  currency: string,
  budgetBaseMinor: number,
  ratios: AllocationRatios,
  now: string,
): MonthlyBudget {
  assertMonthKey(monthKey);
  const targets = allocateByBasisPoints(money(budgetBaseMinor, currency), {
    LIVING: ratios.LIVING,
    SAVING: ratios.SAVING,
    FUN: ratios.FUN,
  });

  return {
    monthKey,
    currency,
    budgetBaseMinor,
    budgetBaseMode: 'AUTO',
    livingRatioBp: ratios.LIVING,
    savingRatioBp: ratios.SAVING,
    funRatioBp: ratios.FUN,
    livingTargetMinor: requireTarget(targets, 'LIVING'),
    savingTargetMinor: requireTarget(targets, 'SAVING'),
    funTargetMinor: requireTarget(targets, 'FUN'),
    createdAt: now,
    updatedAt: now,
    closedAt: null,
  };
}

export function calculateMonthlyBudget(
  monthKey: string,
  currency: string,
  transactions: readonly ClassifiedTransaction[],
  ratios: AllocationRatios,
  incomeAdjustmentMinor = 0,
): MonthlyBudgetSummary {
  assertMonthKey(monthKey);
  if (!Number.isSafeInteger(incomeAdjustmentMinor)) {
    throw new DomainValidationError(
      'Income adjustment must be an integer minor-unit amount.',
    );
  }

  const monthTransactions = transactions.filter(
    ({ raw }) =>
      raw.currency === currency &&
      raw.createdAt.slice(0, 7) === monthKey &&
      !raw.sourceDeleted,
  );
  for (const transaction of monthTransactions) {
    if (transaction.splits.length > 0) {
      validateSplits(transaction.raw, transaction.splits);
    }
  }
  const byId = new Map(transactions.map((item) => [item.raw.id, item]));
  let budgetBaseMinor = incomeAdjustmentMinor;

  for (const item of monthTransactions) {
    const { classification, raw } = item;
    if (
      classification.budgetScope === 'INCLUDED' &&
      classification.eventType === 'INCOME' &&
      classification.countsTowardBudgetBase
    ) {
      budgetBaseMinor = addSafe(budgetBaseMinor, Math.abs(raw.amountMinor));
    }
  }

  if (budgetBaseMinor < 0) {
    throw new DomainValidationError('Budget base cannot be negative.');
  }
  const budget = createMonthlyBudget(
    monthKey,
    currency,
    budgetBaseMinor,
    ratios,
    `${monthKey}-01T00:00:00.000Z`,
  );

  const effects = monthTransactions.map((item) =>
    explainBudgetEffect(item, byId),
  );
  const totals = effects.reduce(
    (sum, effect) => ({
      livingActualMinor: addSafe(
        sum.livingActualMinor,
        effect.livingActualMinor,
      ),
      funActualMinor: addSafe(sum.funActualMinor, effect.funActualMinor),
      savingContributedMinor: addSafe(
        sum.savingContributedMinor,
        effect.savingContributedMinor,
      ),
      savingWithdrawnMinor: addSafe(
        sum.savingWithdrawnMinor,
        effect.savingWithdrawnMinor,
      ),
    }),
    {
      livingActualMinor: 0,
      funActualMinor: 0,
      savingContributedMinor: 0,
      savingWithdrawnMinor: 0,
    },
  );

  const dailyIncludedSpendMinor: Record<string, number> = {};
  for (const [index, item] of monthTransactions.entries()) {
    const effect = effects[index];
    if (effect === undefined || effect.heatMapSpendMinor === 0) {
      continue;
    }
    const date = item.raw.createdAt.slice(0, 10);
    dailyIncludedSpendMinor[date] = addSafe(
      dailyIncludedSpendMinor[date] ?? 0,
      effect.heatMapSpendMinor,
    );
  }

  return {
    monthKey,
    currency,
    budgetBaseMinor,
    livingTargetMinor: budget.livingTargetMinor,
    savingTargetMinor: budget.savingTargetMinor,
    funTargetMinor: budget.funTargetMinor,
    livingActualMinor: totals.livingActualMinor,
    funActualMinor: totals.funActualMinor,
    includedSpendingMinor: addSafe(
      totals.livingActualMinor,
      totals.funActualMinor,
    ),
    savingContributedMinor: totals.savingContributedMinor,
    savingWithdrawnMinor: totals.savingWithdrawnMinor,
    netSavingsMovementMinor: addSafe(
      totals.savingContributedMinor,
      -totals.savingWithdrawnMinor,
    ),
    dailyIncludedSpendMinor,
    effects,
  };
}

export function explainBudgetEffect(
  transaction: ClassifiedTransaction,
  transactionById: ReadonlyMap<string, ClassifiedTransaction> = new Map(),
): BudgetEffect {
  const { classification, raw } = transaction;
  if (classification.budgetScope === 'EXCLUDED') {
    return zeroEffect(raw.id, 'Excluded by explicit budget scope.');
  }

  const portions = effectivePortions(transaction);
  const effect = {
    rawTransactionId: raw.id,
    budgetBaseMinor:
      classification.eventType === 'INCOME' &&
      classification.countsTowardBudgetBase
        ? Math.abs(raw.amountMinor)
        : 0,
    livingActualMinor: 0,
    funActualMinor: 0,
    savingContributedMinor: 0,
    savingWithdrawnMinor: 0,
    includedSpendingMinor: 0,
    heatMapSpendMinor: 0,
    reason: '',
  };
  const reasons = new Set<string>();

  for (const portion of portions) {
    if (portion.budgetScope === 'EXCLUDED') {
      reasons.add('Split portion excluded by explicit budget scope.');
      continue;
    }

    switch (portion.eventType) {
      case 'SPEND':
        applySpend(effect, portion.amountMinorAbs, portion.category);
        reasons.add(
          portion.category === null
            ? 'Spend has no category and does not enter an allocation.'
            : `Included spend assigned to ${portion.category.superCategory}.`,
        );
        break;
      case 'SAVING_CONTRIBUTION':
        effect.savingContributedMinor = addSafe(
          effect.savingContributedMinor,
          portion.amountMinorAbs,
        );
        reasons.add(
          'Saving contribution advances target progress but is not spending.',
        );
        break;
      case 'SAVING_WITHDRAWAL':
        effect.savingWithdrawnMinor = addSafe(
          effect.savingWithdrawnMinor,
          portion.amountMinorAbs,
        );
        reasons.add(
          'Saving withdrawal affects net savings movement, not income or spending.',
        );
        break;
      case 'REFUND':
      case 'REIMBURSEMENT': {
        const offsetCategory = resolveOffsetCategory(
          classification,
          portion.category,
          transactionById,
        );
        applySpend(effect, -portion.amountMinorAbs, offsetCategory);
        reasons.add(
          `${titleCase(portion.eventType)} offsets the linked or assigned spending category.`,
        );
        break;
      }
      case 'INCOME':
        reasons.add(
          classification.countsTowardBudgetBase
            ? 'Included income contributes to the budget base.'
            : 'Income is explicitly excluded from the budget base.',
        );
        break;
      case 'INTERNAL_TRANSFER':
        reasons.add('Internal transfer has no budget effect.');
        break;
      case 'DEBT_PAYMENT':
        reasons.add('Debt payment is neutral because consumption is separate.');
        break;
      case 'NEUTRAL':
        reasons.add('Neutral event has no budget effect.');
        break;
    }
  }

  effect.includedSpendingMinor = addSafe(
    effect.livingActualMinor,
    effect.funActualMinor,
  );
  effect.heatMapSpendMinor = effect.includedSpendingMinor;
  effect.reason = [...reasons].join(' ');
  return effect;
}

function effectivePortions(
  transaction: ClassifiedTransaction,
): readonly EffectivePortion[] {
  const { classification, raw, splits } = transaction;
  if (splits.length === 0) {
    return [
      {
        amountMinorAbs: Math.abs(raw.amountMinor),
        eventType: classification.eventType,
        budgetScope: classification.budgetScope,
        category: transaction.category,
      },
    ];
  }

  const categories = new Map<string, Category>();
  if (transaction.category !== null) {
    categories.set(transaction.category.id, transaction.category);
  }
  for (const category of transaction.splitCategories) {
    categories.set(category.id, category);
  }

  return splits.map((split) => ({
    amountMinorAbs: split.amountMinorAbs,
    eventType: split.eventType,
    budgetScope: split.budgetScope,
    category:
      split.categoryId === null
        ? null
        : (categories.get(split.categoryId) ?? null),
  }));
}

function resolveOffsetCategory(
  classification: Classification,
  category: Category | null,
  transactionById: ReadonlyMap<string, ClassifiedTransaction>,
): Category | null {
  if (classification.offsetRawTransactionId === null) {
    return category;
  }
  return (
    transactionById.get(classification.offsetRawTransactionId)?.category ??
    category
  );
}

function applySpend(
  effect: {
    livingActualMinor: number;
    funActualMinor: number;
  },
  amountMinor: number,
  category: Category | null,
): void {
  if (category?.superCategory === 'LIVING') {
    effect.livingActualMinor = addSafe(effect.livingActualMinor, amountMinor);
  } else if (category?.superCategory === 'FUN') {
    effect.funActualMinor = addSafe(effect.funActualMinor, amountMinor);
  }
}

function zeroEffect(rawTransactionId: string, reason: string): BudgetEffect {
  return {
    rawTransactionId,
    budgetBaseMinor: 0,
    livingActualMinor: 0,
    funActualMinor: 0,
    savingContributedMinor: 0,
    savingWithdrawnMinor: 0,
    includedSpendingMinor: 0,
    heatMapSpendMinor: 0,
    reason,
  };
}

function requireTarget(
  targets: Readonly<Record<string, { readonly amountMinor: number }>>,
  key: SuperCategoryKey,
): number {
  const target = targets[key];
  if (target === undefined) {
    throw new DomainValidationError(`Missing ${key} target.`);
  }
  return target.amountMinor;
}

function assertMonthKey(monthKey: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new DomainValidationError('Month key must use YYYY-MM format.');
  }
}

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError('Budget arithmetic exceeded safe range.');
  }
  return result;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
