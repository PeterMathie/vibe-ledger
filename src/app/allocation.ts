import type { AllocationRatios } from '../domain/budget';
import { DomainValidationError } from '../domain/errors';

export const DEFAULT_ALLOCATION: AllocationRatios = {
  LIVING: 5_000,
  SAVING: 3_000,
  FUN: 2_000,
};

export interface RunoverModel {
  readonly rowCount: number;
  readonly fullRowCount: number;
  readonly partialRowBasisPoints: number;
  readonly virtualized: boolean;
  readonly accessibilityRowSummary: string;
}

export interface RunoverRow {
  readonly index: number;
  readonly fillBasisPoints: number;
  readonly tone: 'IDENTITY' | 'BREACH';
}

export function ratiosFromBoundaries(
  livingEndBp: number,
  savingEndBp: number,
): AllocationRatios {
  const living = clampBasisPoints(livingEndBp);
  const savingEnd = Math.max(living, clampBasisPoints(savingEndBp));
  return {
    LIVING: living,
    SAVING: savingEnd - living,
    FUN: 10_000 - savingEnd,
  };
}

export function parseAllocationPercentages(
  living: string,
  saving: string,
  fun: string,
): AllocationRatios {
  const ratios = {
    LIVING: parsePercentage(living),
    SAVING: parsePercentage(saving),
    FUN: parsePercentage(fun),
  };
  if (ratios.LIVING + ratios.SAVING + ratios.FUN !== 10_000) {
    throw new DomainValidationError(
      'Allocation percentages must total exactly 100%.',
    );
  }
  return ratios;
}

export function createRunoverModel(
  actualMinor: number,
  targetMinor: number,
): RunoverModel {
  if (
    !Number.isSafeInteger(actualMinor) ||
    !Number.isSafeInteger(targetMinor) ||
    actualMinor < 0 ||
    targetMinor < 0
  ) {
    throw new DomainValidationError(
      'Runover values must be non-negative integer minor units.',
    );
  }
  if (targetMinor === 0 || actualMinor === 0) {
    return {
      rowCount: 0,
      fullRowCount: 0,
      partialRowBasisPoints: 0,
      virtualized: false,
      accessibilityRowSummary:
        targetMinor === 0 ? 'No target set.' : 'No target used.',
    };
  }

  const sourceValue = BigInt(actualMinor);
  const unitValue = BigInt(targetMinor);
  const fullRows = sourceValue / unitValue;
  const remainder = sourceValue % unitValue;
  const rowCount = Number(fullRows + (remainder === 0n ? 0n : 1n));
  const partialRowBasisPoints =
    remainder === 0n ? 0 : Number((remainder * 10_000n) / unitValue);
  return {
    rowCount,
    fullRowCount: Number(fullRows),
    partialRowBasisPoints,
    virtualized: rowCount > 12,
    accessibilityRowSummary: `${rowCount} budget-length row${rowCount === 1 ? '' : 's'}; ${Number(fullRows)} full${remainder === 0n ? '' : ` and ${formatBasisPoints(partialRowBasisPoints)} of the final row`}.`,
  };
}

export function runoverRow(model: RunoverModel, index: number): RunoverRow {
  if (!Number.isSafeInteger(index) || index < 0 || index >= model.rowCount) {
    throw new DomainValidationError('Runover row index is outside the model.');
  }
  return {
    index,
    fillBasisPoints:
      index < model.fullRowCount ? 10_000 : model.partialRowBasisPoints,
    tone: index === 0 ? 'IDENTITY' : 'BREACH',
  };
}

function parsePercentage(value: string): number {
  const normalized = value.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (match === null) {
    throw new DomainValidationError(
      'Allocation percentages use up to two decimal places.',
    );
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const basisPoints = whole * 100 + fraction;
  if (basisPoints > 10_000) {
    throw new DomainValidationError(
      'An allocation percentage cannot exceed 100%.',
    );
  }
  return basisPoints;
}

function clampBasisPoints(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

function formatBasisPoints(value: number): string {
  const whole = Math.trunc(value / 100);
  const fraction = value % 100;
  return fraction === 0
    ? `${whole}%`
    : `${whole}.${fraction.toString().padStart(2, '0').replace(/0$/, '')}%`;
}
