import { CurrencyMismatchError, DomainValidationError } from './errors';

export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new DomainValidationError('Money amount must be a safe integer.');
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new DomainValidationError(
      'Money currency must be a three-letter ISO 4217 code.',
    );
  }

  return Object.freeze({ amountMinor, currency: normalizedCurrency });
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(
    safeIntegerAdd(left.amountMinor, right.amountMinor),
    left.currency,
  );
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(
    safeIntegerAdd(left.amountMinor, -right.amountMinor),
    left.currency,
  );
}

export function absoluteMoney(value: Money): Money {
  if (value.amountMinor === Number.MIN_SAFE_INTEGER) {
    throw new DomainValidationError('Money amount exceeds safe integer range.');
  }
  return money(Math.abs(value.amountMinor), value.currency);
}

export function negateMoney(value: Money): Money {
  return money(-value.amountMinor, value.currency);
}

export function formatMoney(value: Money, locale?: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10n ** BigInt(fractionDigits);
  const absoluteMinor = BigInt(
    value.amountMinor < 0 ? -value.amountMinor : value.amountMinor,
  );
  const major = integerQuotient(absoluteMinor, divisor);
  const fraction = (absoluteMinor % divisor)
    .toString()
    .padStart(fractionDigits, '0');
  const integerParts = new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).formatToParts(Number(major));
  const template = formatter.formatToParts(value.amountMinor < 0 ? -1 : 1);
  const result: string[] = [];
  let insertedInteger = false;

  for (const part of template) {
    if (part.type === 'integer' || part.type === 'group') {
      if (!insertedInteger) {
        result.push(...integerParts.map(({ value: partValue }) => partValue));
        insertedInteger = true;
      }
    } else if (part.type === 'fraction') {
      result.push(fraction);
    } else {
      result.push(part.value);
    }
  }

  return result.join('');
}

export function allocateByBasisPoints(
  total: Money,
  ratios: Readonly<Record<string, number>>,
): Readonly<Record<string, Money>> {
  const entries = Object.entries(ratios);
  if (
    entries.length === 0 ||
    entries.some(([, ratio]) => !Number.isSafeInteger(ratio) || ratio < 0)
  ) {
    throw new DomainValidationError(
      'Allocation ratios must be non-negative integer basis points.',
    );
  }

  const ratioTotal = entries.reduce(
    (sum, [, ratio]) => safeIntegerAdd(sum, ratio),
    0,
  );
  if (ratioTotal !== 10_000) {
    throw new DomainValidationError(
      'Allocation ratios must total exactly 10,000 basis points.',
    );
  }
  if (total.amountMinor < 0) {
    throw new DomainValidationError('Allocation total cannot be negative.');
  }

  const totalBigInt = BigInt(total.amountMinor);
  const allocations = entries.map(([key, ratio], index) => {
    const product = totalBigInt * BigInt(ratio);
    return {
      key,
      index,
      amountMinor: product / 10_000n,
      remainder: product % 10_000n,
    };
  });
  const allocated = allocations.reduce(
    (sum, item) => sum + item.amountMinor,
    0n,
  );
  let remainderUnits = totalBigInt - allocated;

  const byRemainder = [...allocations].sort(
    (left, right) =>
      Number(right.remainder - left.remainder) || left.index - right.index,
  );
  for (const item of byRemainder) {
    if (remainderUnits === 0n) {
      break;
    }
    item.amountMinor += 1n;
    remainderUnits -= 1n;
  }

  return Object.fromEntries(
    allocations.map(({ key, amountMinor }) => [
      key,
      money(Number(amountMinor), total.currency),
    ]),
  );
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(
      `Cannot combine ${left.currency} and ${right.currency}.`,
    );
  }
}

function safeIntegerAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError('Money arithmetic exceeded safe range.');
  }
  return result;
}

function integerQuotient(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator;
}
