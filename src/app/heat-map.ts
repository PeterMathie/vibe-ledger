import { DomainValidationError } from '../domain/errors';

export type HeatTone = 'NEUTRAL' | 'GREEN' | 'RED';

export interface HeatMapDay {
  readonly date: string;
  readonly day: number;
  readonly amountMinor: number;
  readonly tone: HeatTone;
  readonly intensityBasisPoints: number;
  readonly status: string;
}

export interface MonthlyHeatMap {
  readonly month: string;
  readonly daysInMonth: number;
  readonly leadingBlankCount: number;
  readonly dailyReferenceNumeratorMinor: number;
  readonly dailyReferenceDenominator: number;
  readonly monthlySpendableMinor: number;
  readonly days: readonly HeatMapDay[];
}

export function createMonthlyHeatMap(
  month: string,
  livingTargetMinor: number,
  funTargetMinor: number,
  dailySpendMinor: Readonly<Record<string, number>>,
): MonthlyHeatMap {
  assertMonth(month);
  const monthlySpendableMinor = safeAdd(livingTargetMinor, funTargetMinor);
  if (monthlySpendableMinor < 0) {
    throw new DomainValidationError(
      'Monthly spendable target cannot be negative.',
    );
  }
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const sundayBased = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const leadingBlankCount = (sundayBased + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${day.toString().padStart(2, '0')}`;
    const amountMinor = dailySpendMinor[date] ?? 0;
    return classifyDay(
      date,
      day,
      amountMinor,
      monthlySpendableMinor,
      daysInMonth,
    );
  });

  return {
    month,
    daysInMonth,
    leadingBlankCount,
    dailyReferenceNumeratorMinor: monthlySpendableMinor,
    dailyReferenceDenominator: daysInMonth,
    monthlySpendableMinor,
    days,
  };
}

function classifyDay(
  date: string,
  day: number,
  amountMinor: number,
  monthlySpendableMinor: number,
  daysInMonth: number,
): HeatMapDay {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new DomainValidationError(
      'Heat-map spending must be an integer minor-unit amount.',
    );
  }
  if (amountMinor <= 0 || monthlySpendableMinor === 0) {
    return {
      date,
      day,
      amountMinor,
      tone: 'NEUTRAL',
      intensityBasisPoints: 0,
      status:
        amountMinor < 0
          ? 'Net refund or reimbursement'
          : amountMinor === 0
            ? 'No included spending'
            : 'No spendable target',
    };
  }

  const value = BigInt(amountMinor);
  const limit = BigInt(monthlySpendableMinor);
  const dayCount = BigInt(daysInMonth);
  const dailyComparison = value * dayCount;
  if (dailyComparison <= limit) {
    return {
      date,
      day,
      amountMinor,
      tone: 'GREEN',
      intensityBasisPoints: Number((dailyComparison * 10_000n) / limit),
      status:
        dailyComparison === limit
          ? 'At daily reference'
          : 'Below daily reference',
    };
  }

  const redNumerator = (dailyComparison - limit) * 10_000n;
  const redDenominator = limit * (dayCount - 1n);
  return {
    date,
    day,
    amountMinor,
    tone: 'RED',
    intensityBasisPoints: Math.min(
      10_000,
      Number(redNumerator / redDenominator),
    ),
    status:
      amountMinor >= monthlySpendableMinor
        ? 'At or above monthly spendable budget'
        : 'Above daily reference',
  };
}

function assertMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new DomainValidationError('Heat-map month must use YYYY-MM.');
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError('Heat-map target exceeded safe range.');
  }
  return result;
}
