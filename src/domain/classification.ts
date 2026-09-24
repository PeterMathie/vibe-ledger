import { DomainValidationError } from './errors';
import type { ClassificationSource } from './enums';
import type { Classification, RawTransaction, TransactionSplit } from './types';

const SOURCE_PRECEDENCE: Readonly<Record<ClassificationSource, number>> = {
  MANUAL: 6,
  RULE: 5,
  SUBSCRIPTION: 4,
  TRANSFER_RULE: 3,
  IMPORT_HINT: 2,
  DEFAULT: 1,
};

export function resolveEffectiveClassification(
  candidates: readonly Classification[],
): Classification | null {
  return (
    [...candidates].sort((left, right) => {
      const precedence =
        SOURCE_PRECEDENCE[right.classificationSource] -
        SOURCE_PRECEDENCE[left.classificationSource];
      if (precedence !== 0) {
        return precedence;
      }
      return (
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        right.id.localeCompare(left.id)
      );
    })[0] ?? null
  );
}

export function validateSplits(
  raw: RawTransaction,
  splits: readonly TransactionSplit[],
): void {
  if (splits.length < 2) {
    throw new DomainValidationError(
      'A split transaction requires at least two portions.',
    );
  }

  const expected = BigInt(Math.abs(raw.amountMinor));
  const actual = splits.reduce((sum, split) => {
    if (
      split.rawTransactionId !== raw.id ||
      !Number.isSafeInteger(split.amountMinorAbs) ||
      split.amountMinorAbs < 0
    ) {
      throw new DomainValidationError('Split transaction portion is invalid.');
    }
    return sum + BigInt(split.amountMinorAbs);
  }, 0n);

  if (actual !== expected) {
    throw new DomainValidationError(
      `Split portions total ${actual}, expected ${expected}.`,
    );
  }
}
