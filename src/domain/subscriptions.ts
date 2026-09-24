import { DomainValidationError } from './errors';
import { formatMoney, money, type Money } from './money';
import type {
  RenewalIntent,
  Subscription,
  SubscriptionDetectionState,
  SubscriptionReservePlan,
} from './types';

export interface ExactMonthlyEquivalent {
  readonly numeratorMinor: bigint;
  readonly denominator: bigint;
  readonly currency: string;
}

export interface SubscriptionInput {
  readonly id: string;
  readonly name: string;
  readonly merchantMatch: string | null;
  readonly billingAmountMinor: number;
  readonly billingCurrency: string;
  readonly intervalMonths: number | null;
  readonly intervalDays: number | null;
  readonly lastPaymentDate: string | null;
  readonly nextExpectedDate: string | null;
  readonly detectionState: SubscriptionDetectionState;
  readonly renewalIntent: RenewalIntent;
  readonly categoryId: string;
  readonly active?: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReservePlanInput {
  readonly id: string;
  readonly subscriptionId: string;
  readonly targetAmountMinor: number;
  readonly targetCurrency: string;
  readonly reservedAmountMinor: number;
  readonly targetDate: string;
  readonly enabled?: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function createSubscription(input: SubscriptionInput): Subscription {
  if (input.id.trim() === '' || input.name.trim() === '') {
    throw new DomainValidationError('Subscription id and name are required.');
  }
  const amount = money(input.billingAmountMinor, input.billingCurrency);
  if (amount.amountMinor < 0) {
    throw new DomainValidationError('Subscription amount cannot be negative.');
  }
  assertInterval(input.intervalMonths, input.intervalDays);
  assertOptionalDate(input.lastPaymentDate, 'Last payment date');
  assertOptionalDate(input.nextExpectedDate, 'Next expected date');
  if (input.categoryId.trim() === '') {
    throw new DomainValidationError('Subscription category is required.');
  }
  return Object.freeze({
    id: input.id,
    name: input.name.trim(),
    merchantMatch: normalizeOptional(input.merchantMatch),
    billingAmountMinor: amount.amountMinor,
    billingCurrency: amount.currency,
    intervalMonths: input.intervalMonths,
    intervalDays: input.intervalDays,
    lastPaymentDate: input.lastPaymentDate,
    nextExpectedDate: input.nextExpectedDate,
    detectionState: input.detectionState,
    renewalIntent: input.renewalIntent,
    categoryId: input.categoryId,
    active: input.active ?? true,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function createReservePlan(
  input: ReservePlanInput,
): SubscriptionReservePlan {
  const target = money(input.targetAmountMinor, input.targetCurrency);
  const reserved = money(input.reservedAmountMinor, input.targetCurrency);
  if (target.amountMinor < 0 || reserved.amountMinor < 0) {
    throw new DomainValidationError('Reserve amounts cannot be negative.');
  }
  assertDate(input.targetDate, 'Reserve target date');
  return Object.freeze({
    ...input,
    targetCurrency: target.currency,
    enabled: input.enabled ?? true,
  });
}

export function monthlyEquivalent(
  subscription: Pick<
    Subscription,
    'billingAmountMinor' | 'billingCurrency' | 'intervalMonths' | 'intervalDays'
  >,
): ExactMonthlyEquivalent {
  assertInterval(subscription.intervalMonths, subscription.intervalDays);
  const amount = money(
    subscription.billingAmountMinor,
    subscription.billingCurrency,
  );
  if (subscription.intervalMonths !== null) {
    return {
      numeratorMinor: BigInt(amount.amountMinor),
      denominator: BigInt(subscription.intervalMonths),
      currency: amount.currency,
    };
  }
  return {
    // Mean Gregorian month: 365.2425 / 12 = 48699 / 1600 days.
    numeratorMinor: BigInt(amount.amountMinor) * 48_699n,
    denominator: BigInt(subscription.intervalDays ?? 0) * 1_600n,
    currency: amount.currency,
  };
}

export function roundExactMinor(value: ExactMonthlyEquivalent): Money {
  const rounded =
    (value.numeratorMinor * 2n + value.denominator) / (value.denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainValidationError('Monthly equivalent exceeds safe range.');
  }
  return money(Number(rounded), value.currency);
}

export function formatMonthlyEquivalent(
  subscription: Parameters<typeof monthlyEquivalent>[0],
  locale = 'en-GB',
): string {
  return `${formatMoney(roundExactMinor(monthlyEquivalent(subscription)), locale)}/month`;
}

export function addInterval(
  date: string,
  interval: Pick<Subscription, 'intervalMonths' | 'intervalDays'>,
): string {
  assertDate(date, 'Interval date');
  assertInterval(interval.intervalMonths, interval.intervalDays);
  if (interval.intervalDays !== null) {
    const value = parseDate(date);
    value.setUTCDate(value.getUTCDate() + interval.intervalDays);
    return formatDate(value);
  }
  const source = parseDate(date);
  const day = source.getUTCDate();
  const result = new Date(
    Date.UTC(
      source.getUTCFullYear(),
      source.getUTCMonth() + (interval.intervalMonths ?? 0),
      1,
    ),
  );
  const finalDay = Math.min(day, daysInMonth(result));
  result.setUTCDate(finalDay);
  return formatDate(result);
}

export function requiredMonthlyReserve(
  plan: Pick<
    SubscriptionReservePlan,
    | 'targetAmountMinor'
    | 'targetCurrency'
    | 'reservedAmountMinor'
    | 'targetDate'
  >,
  asOfDate: string,
): ExactMonthlyEquivalent {
  assertDate(asOfDate, 'Reserve calculation date');
  assertDate(plan.targetDate, 'Reserve target date');
  const remaining = Math.max(
    plan.targetAmountMinor - plan.reservedAmountMinor,
    0,
  );
  const months = calendarMonthsUntil(asOfDate, plan.targetDate);
  if (remaining > 0 && months <= 0) {
    throw new DomainValidationError(
      'Reserve target date must leave at least one month to save.',
    );
  }
  return {
    numeratorMinor: BigInt(remaining),
    denominator: BigInt(Math.max(months, 1)),
    currency: money(remaining, plan.targetCurrency).currency,
  };
}

export function calendarMonthsUntil(fromDate: string, toDate: string): number {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    to.getUTCMonth() -
    from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1;
  }
  return months;
}

export function daysUntil(fromDate: string, toDate: string): number {
  return Math.floor(
    (parseDate(toDate).valueOf() - parseDate(fromDate).valueOf()) / 86_400_000,
  );
}

function assertInterval(months: number | null, days: number | null): void {
  if ((months === null) === (days === null)) {
    throw new DomainValidationError(
      'Provide exactly one subscription interval in months or days.',
    );
  }
  const value = months ?? days;
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new DomainValidationError(
      'Subscription interval must be a positive integer.',
    );
  }
}

function assertOptionalDate(value: string | null, label: string): void {
  if (value !== null) {
    assertDate(value, label);
  }
}

function assertDate(value: string, label: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    formatDate(parseDate(value)) !== value
  ) {
    throw new DomainValidationError(
      `${label} must use a valid YYYY-MM-DD date.`,
    );
  }
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysInMonth(value: Date): number {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

function normalizeOptional(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}
