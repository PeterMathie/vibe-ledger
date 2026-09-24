import { DomainValidationError } from '../domain/errors';
import { formatMoney, money } from '../domain/money';
import {
  addInterval,
  calendarMonthsUntil,
  createReservePlan,
  createSubscription,
  daysUntil,
  formatMonthlyEquivalent,
  monthlyEquivalent,
  requiredMonthlyReserve,
  roundExactMinor,
  type ReservePlanInput,
  type SubscriptionInput,
} from '../domain/subscriptions';
import type {
  RenewalIntent,
  Subscription,
  SubscriptionReservePlan,
} from '../domain/types';
import type { Database } from './database';

export interface SubscriptionRecord {
  readonly subscription: Subscription;
  readonly reservePlan: SubscriptionReservePlan | null;
  readonly linkedTransactionIds: readonly string[];
  readonly monthlyEquivalentLabel: string;
  readonly requiredReserveLabel: string | null;
}

export interface SubscriptionSuggestion {
  readonly signature: string;
  readonly name: string;
  readonly merchantMatch: string;
  readonly billingAmountMinor: number;
  readonly billingCurrency: string;
  readonly intervalMonths: number | null;
  readonly intervalDays: number | null;
  readonly lastPaymentDate: string;
  readonly nextExpectedDate: string;
  readonly confidence: 'HIGH' | 'MEDIUM';
  readonly evidenceCount: number;
  readonly transactionIds: readonly string[];
}

export interface SubscriptionCurrencySummary {
  readonly currency: string;
  readonly exactMonthlyEquivalent: {
    readonly numeratorMinor: bigint;
    readonly denominator: bigint;
  };
  readonly confirmedMonthlyEquivalentMinor: number;
  readonly longIntervalMonthlyEquivalentMinor: number;
  readonly totalMonthlyEquivalentMinor: number;
  readonly renewalsIn30Days: number;
  readonly renewalsIn90Days: number;
}

interface SubscriptionRow {
  readonly id: string;
  readonly name: string;
  readonly merchant_match: string | null;
  readonly billing_amount_minor: number;
  readonly billing_currency: string;
  readonly interval_months: number | null;
  readonly interval_days: number | null;
  readonly last_payment_date: string | null;
  readonly next_expected_date: string | null;
  readonly detection_state: Subscription['detectionState'];
  readonly renewal_intent: RenewalIntent;
  readonly category_id: string;
  readonly active: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ReserveRow {
  readonly id: string;
  readonly subscription_id: string;
  readonly target_amount_minor: number;
  readonly target_currency: string;
  readonly reserved_amount_minor: number;
  readonly target_date: string;
  readonly enabled: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface DetectorRow {
  readonly id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly description: string;
  readonly merchant_name: string | null;
  readonly created_at: string;
}

export async function listSubscriptions(
  database: Database,
  asOfDate: string,
  includeInactive = false,
): Promise<readonly SubscriptionRecord[]> {
  const rows = await database.getAllAsync<SubscriptionRow>(
    `SELECT * FROM subscriptions
     ${includeInactive ? '' : 'WHERE active = 1'}
     ORDER BY active DESC, next_expected_date IS NULL, next_expected_date, name;`,
  );
  const [reserveRows, linkRows] = await Promise.all([
    database.getAllAsync<ReserveRow>(
      'SELECT * FROM subscription_reserve_plans;',
    ),
    database.getAllAsync<{
      subscription_id: string;
      raw_transaction_id: string;
    }>(
      `SELECT subscription_id, raw_transaction_id
       FROM subscription_transactions
       ORDER BY linked_at, raw_transaction_id;`,
    ),
  ]);
  return rows.map((row) => {
    const subscription = mapSubscription(row);
    const reserveRow = reserveRows.find(
      ({ subscription_id }) => subscription_id === row.id,
    );
    const reservePlan =
      reserveRow === undefined ? null : mapReserve(reserveRow);
    return {
      subscription,
      reservePlan,
      linkedTransactionIds: linkRows
        .filter(({ subscription_id }) => subscription_id === row.id)
        .map(({ raw_transaction_id }) => raw_transaction_id),
      monthlyEquivalentLabel: formatMonthlyEquivalent(subscription),
      requiredReserveLabel:
        reservePlan === null || !reservePlan.enabled
          ? null
          : reservePlan.targetAmountMinor > reservePlan.reservedAmountMinor &&
              calendarMonthsUntil(asOfDate, reservePlan.targetDate) <= 0
            ? 'Due now'
            : `${formatMoneyValue(roundExactMinor(requiredMonthlyReserve(reservePlan, asOfDate)))}/month`,
    };
  });
}

export async function saveSubscription(
  database: Database,
  input: SubscriptionInput,
  rawTransactionIds: readonly string[] = [],
): Promise<Subscription> {
  const subscription = createSubscription(input);
  const existingReserve = await database.getFirstAsync<{
    target_currency: string;
  }>(
    `SELECT target_currency FROM subscription_reserve_plans
     WHERE subscription_id = ? AND enabled = 1;`,
    subscription.id,
  );
  if (
    existingReserve !== null &&
    existingReserve.target_currency !== subscription.billingCurrency
  ) {
    throw new DomainValidationError(
      'Disable or update the reserve plan before changing currency.',
    );
  }
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await upsertSubscription(database, subscription);
    for (const rawTransactionId of rawTransactionIds) {
      await database.runAsync(
        `INSERT INTO subscription_transactions (
          subscription_id, raw_transaction_id, linked_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(subscription_id, raw_transaction_id) DO NOTHING;`,
        subscription.id,
        rawTransactionId,
        subscription.updatedAt,
      );
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
  return subscription;
}

export async function disableSubscription(
  database: Database,
  id: string,
  updatedAt: string,
): Promise<void> {
  const result = await database.runAsync(
    'UPDATE subscriptions SET active = 0, updated_at = ? WHERE id = ?;',
    updatedAt,
    id,
  );
  if (result.changes !== 1) {
    throw new DomainValidationError('Subscription was not found.');
  }
}

export async function saveReservePlan(
  database: Database,
  input: ReservePlanInput,
): Promise<SubscriptionReservePlan> {
  const plan = createReservePlan(input);
  const subscription = await database.getFirstAsync<{
    billing_currency: string;
  }>(
    'SELECT billing_currency FROM subscriptions WHERE id = ?;',
    plan.subscriptionId,
  );
  if (subscription === null) {
    throw new DomainValidationError('Subscription was not found.');
  }
  if (subscription.billing_currency !== plan.targetCurrency) {
    throw new DomainValidationError(
      'Reserve target currency must match the subscription currency.',
    );
  }
  await upsertReservePlan(database, plan);
  return plan;
}

export async function saveSubscriptionDetails(
  database: Database,
  subscriptionInput: SubscriptionInput,
  reserveInput: ReservePlanInput | null,
): Promise<Subscription> {
  const subscription = createSubscription(subscriptionInput);
  const reserve =
    reserveInput === null ? null : createReservePlan(reserveInput);
  if (reserve !== null && reserve.subscriptionId !== subscription.id) {
    throw new DomainValidationError(
      'Reserve plan must belong to the edited subscription.',
    );
  }
  if (
    reserve !== null &&
    reserve.targetCurrency !== subscription.billingCurrency
  ) {
    throw new DomainValidationError(
      'Reserve target currency must match the subscription currency.',
    );
  }
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await upsertSubscription(database, subscription);
    if (reserve !== null) {
      await upsertReservePlan(database, reserve);
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
  return subscription;
}

export async function detectSubscriptionSuggestions(
  database: Database,
): Promise<readonly SubscriptionSuggestion[]> {
  const [rows, denials, linked] = await Promise.all([
    database.getAllAsync<DetectorRow>(
      `SELECT r.id, r.amount_minor, r.currency, r.description,
        r.merchant_name, r.created_at
       FROM raw_transactions r
       JOIN transaction_classifications c
         ON c.raw_transaction_id = r.id AND c.active = 1
       WHERE r.source_deleted = 0 AND c.event_type = 'SPEND'
       ORDER BY r.created_at, r.id;`,
    ),
    database.getAllAsync<{ signature: string }>(
      'SELECT signature FROM subscription_detection_denials;',
    ),
    database.getAllAsync<{ raw_transaction_id: string }>(
      'SELECT raw_transaction_id FROM subscription_transactions;',
    ),
  ]);
  const denied = new Set(denials.map(({ signature }) => signature));
  const linkedIds = new Set(
    linked.map(({ raw_transaction_id }) => raw_transaction_id),
  );
  const groups = new Map<string, DetectorRow[]>();
  for (const row of rows) {
    if (linkedIds.has(row.id)) {
      continue;
    }
    const merchant = detectorMerchant(row);
    const existingKey = [...groups.keys()].find((key) => {
      const separator = key.indexOf(':');
      return (
        key.slice(0, separator) === row.currency &&
        merchantsAreSimilar(key.slice(separator + 1), merchant)
      );
    });
    const key = existingKey ?? `${row.currency}:${merchant}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].flatMap((group) => {
    const suggestion = detectGroup(group);
    return suggestion === null || denied.has(suggestion.signature)
      ? []
      : [suggestion];
  });
}

export async function denySubscriptionSuggestion(
  database: Database,
  signature: string,
  deniedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO subscription_detection_denials (signature, denied_at)
     VALUES (?, ?) ON CONFLICT(signature) DO UPDATE SET denied_at = excluded.denied_at;`,
    signature,
    deniedAt,
  );
}

export async function confirmSubscriptionSuggestion(
  database: Database,
  suggestion: SubscriptionSuggestion,
  id: string,
  timestamp: string,
): Promise<Subscription> {
  return saveSubscription(
    database,
    {
      id,
      name: suggestion.name,
      merchantMatch: suggestion.merchantMatch,
      billingAmountMinor: suggestion.billingAmountMinor,
      billingCurrency: suggestion.billingCurrency,
      intervalMonths: suggestion.intervalMonths,
      intervalDays: suggestion.intervalDays,
      lastPaymentDate: suggestion.lastPaymentDate,
      nextExpectedDate: suggestion.nextExpectedDate,
      detectionState: 'CONFIRMED',
      renewalIntent: 'UNKNOWN',
      categoryId: 'category:subscriptions',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    suggestion.transactionIds,
  );
}

export function summarizeSubscriptions(
  records: readonly SubscriptionRecord[],
  asOfDate: string,
): readonly SubscriptionCurrencySummary[] {
  const grouped = new Map<string, SubscriptionRecord[]>();
  for (const record of records.filter(
    ({ subscription }) => subscription.active,
  )) {
    const currency = record.subscription.billingCurrency;
    grouped.set(currency, [...(grouped.get(currency) ?? []), record]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, currencyRecords]) => {
      let confirmedExact = { numerator: 0n, denominator: 1n };
      let longExact = { numerator: 0n, denominator: 1n };
      let renewalsIn30Days = 0;
      let renewalsIn90Days = 0;
      let exactNumerator = 0n;
      let exactDenominator = 1n;
      for (const { subscription } of currencyRecords) {
        const exact = monthlyEquivalent(subscription);
        const commonDenominator = exactDenominator * exact.denominator;
        exactNumerator =
          exactNumerator * exact.denominator +
          exact.numeratorMinor * exactDenominator;
        exactDenominator = commonDenominator;
        const divisor = greatestCommonDivisor(
          exactNumerator < 0n ? -exactNumerator : exactNumerator,
          exactDenominator,
        );
        exactNumerator /= divisor;
        exactDenominator /= divisor;
        if (subscription.intervalMonths === 1) {
          confirmedExact = addFraction(
            confirmedExact,
            exact.numeratorMinor,
            exact.denominator,
          );
        } else {
          longExact = addFraction(
            longExact,
            exact.numeratorMinor,
            exact.denominator,
          );
        }
        if (subscription.nextExpectedDate !== null) {
          const days = daysUntil(asOfDate, subscription.nextExpectedDate);
          if (days >= 0 && days <= 30) {
            renewalsIn30Days += 1;
          }
          if (days >= 0 && days <= 90) {
            renewalsIn90Days += 1;
          }
        }
      }
      return {
        currency,
        exactMonthlyEquivalent: {
          numeratorMinor: exactNumerator,
          denominator: exactDenominator,
        },
        confirmedMonthlyEquivalentMinor: roundExactMinor({
          numeratorMinor: confirmedExact.numerator,
          denominator: confirmedExact.denominator,
          currency,
        }).amountMinor,
        longIntervalMonthlyEquivalentMinor: roundExactMinor({
          numeratorMinor: longExact.numerator,
          denominator: longExact.denominator,
          currency,
        }).amountMinor,
        totalMonthlyEquivalentMinor: roundExactMinor({
          numeratorMinor: exactNumerator,
          denominator: exactDenominator,
          currency,
        }).amountMinor,
        renewalsIn30Days,
        renewalsIn90Days,
      };
    });
}

function detectGroup(
  rows: readonly DetectorRow[],
): SubscriptionSuggestion | null {
  if (rows.length < 3) {
    return null;
  }
  const amounts = rows.map(({ amount_minor }) => Math.abs(amount_minor));
  const sortedAmounts = [...amounts].sort((left, right) => left - right);
  const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)] ?? 0;
  const tolerance = Math.max(100, tenthRoundedUp(medianAmount));
  if (amounts.some((amount) => Math.abs(amount - medianAmount) > tolerance)) {
    return null;
  }
  const dates = rows.map(({ created_at }) => created_at.slice(0, 10));
  const interval = detectInterval(dates);
  if (interval === null) {
    return null;
  }
  const merchantMatch = detectorMerchant(rows[0] as DetectorRow);
  const signature = [
    rows[0]?.currency,
    merchantMatch,
    interval.months === null ? `d${interval.days}` : `m${interval.months}`,
  ].join(':');
  const lastPaymentDate = dates[dates.length - 1] as string;
  return {
    signature,
    name: displayMerchant(rows[0] as DetectorRow),
    merchantMatch,
    billingAmountMinor: medianAmount,
    billingCurrency: rows[0]?.currency ?? 'GBP',
    intervalMonths: interval.months,
    intervalDays: interval.days,
    lastPaymentDate,
    nextExpectedDate: addInterval(lastPaymentDate, {
      intervalMonths: interval.months,
      intervalDays: interval.days,
    }),
    confidence: rows.length >= 4 ? 'HIGH' : 'MEDIUM',
    evidenceCount: rows.length,
    transactionIds: rows.map(({ id }) => id),
  };
}

function detectInterval(
  dates: readonly string[],
): { readonly months: number | null; readonly days: number | null } | null {
  for (const months of [1, 3, 6, 12, 24]) {
    if (
      dates.slice(1).every((date, index) => {
        const expected = addInterval(dates[index] as string, {
          intervalMonths: months,
          intervalDays: null,
        });
        return Math.abs(daysUntil(expected, date)) <= 4;
      })
    ) {
      return { months, days: null };
    }
  }
  const gaps = dates
    .slice(1)
    .map((date, index) => daysUntil(dates[index] as string, date));
  const sorted = [...gaps].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median < 2 || gaps.some((gap) => Math.abs(gap - median) > 3)) {
    return null;
  }
  return { months: null, days: median };
}

function detectorMerchant(row: DetectorRow): string {
  return (row.merchant_name ?? row.description)
    .toLowerCase()
    .replace(/\b(payment|purchase|card|synthetic|ltd|limited|inc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function displayMerchant(row: DetectorRow): string {
  return (row.merchant_name ?? row.description).trim();
}

function merchantsAreSimilar(left: string, right: string): boolean {
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }
  const distance = levenshteinDistance(left, right);
  return (
    distance <=
    Math.max(2, Math.floor(Math.max(left.length, right.length) * 0.2))
  );
}

function levenshteinDistance(left: string, right: string): number {
  let previous = [...right].map((_, index) => index + 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          (current[rightIndex] ?? 0) + 1,
          (previous[rightIndex + 1] ?? 0) + 1,
          (previous[rightIndex] ?? 0) +
            (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? left.length;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a === 0n ? 1n : a;
}

function addFraction(
  current: { readonly numerator: bigint; readonly denominator: bigint },
  numerator: bigint,
  denominator: bigint,
): { readonly numerator: bigint; readonly denominator: bigint } {
  const nextNumerator =
    current.numerator * denominator + numerator * current.denominator;
  const nextDenominator = current.denominator * denominator;
  const divisor = greatestCommonDivisor(
    nextNumerator < 0n ? -nextNumerator : nextNumerator,
    nextDenominator,
  );
  return {
    numerator: nextNumerator / divisor,
    denominator: nextDenominator / divisor,
  };
}

function tenthRoundedUp(value: number): number {
  return Number((BigInt(value) + 9n) / 10n);
}

async function upsertSubscription(
  database: Database,
  subscription: Subscription,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO subscriptions (
      id, name, merchant_match, billing_amount_minor, billing_currency,
      interval_months, interval_days, last_payment_date, next_expected_date,
      detection_state, renewal_intent, category_id, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      merchant_match = excluded.merchant_match,
      billing_amount_minor = excluded.billing_amount_minor,
      billing_currency = excluded.billing_currency,
      interval_months = excluded.interval_months,
      interval_days = excluded.interval_days,
      last_payment_date = excluded.last_payment_date,
      next_expected_date = excluded.next_expected_date,
      detection_state = excluded.detection_state,
      renewal_intent = excluded.renewal_intent,
      category_id = excluded.category_id,
      active = excluded.active,
      updated_at = excluded.updated_at;`,
    subscription.id,
    subscription.name,
    subscription.merchantMatch,
    subscription.billingAmountMinor,
    subscription.billingCurrency,
    subscription.intervalMonths,
    subscription.intervalDays,
    subscription.lastPaymentDate,
    subscription.nextExpectedDate,
    subscription.detectionState,
    subscription.renewalIntent,
    subscription.categoryId,
    subscription.active ? 1 : 0,
    subscription.createdAt,
    subscription.updatedAt,
  );
}

async function upsertReservePlan(
  database: Database,
  plan: SubscriptionReservePlan,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO subscription_reserve_plans (
      id, subscription_id, target_amount_minor, target_currency,
      reserved_amount_minor, target_date, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(subscription_id) DO UPDATE SET
      target_amount_minor = excluded.target_amount_minor,
      target_currency = excluded.target_currency,
      reserved_amount_minor = excluded.reserved_amount_minor,
      target_date = excluded.target_date,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at;`,
    plan.id,
    plan.subscriptionId,
    plan.targetAmountMinor,
    plan.targetCurrency,
    plan.reservedAmountMinor,
    plan.targetDate,
    plan.enabled ? 1 : 0,
    plan.createdAt,
    plan.updatedAt,
  );
}

function mapSubscription(row: SubscriptionRow): Subscription {
  return createSubscription({
    id: row.id,
    name: row.name,
    merchantMatch: row.merchant_match,
    billingAmountMinor: row.billing_amount_minor,
    billingCurrency: row.billing_currency,
    intervalMonths: row.interval_months,
    intervalDays: row.interval_days,
    lastPaymentDate: row.last_payment_date,
    nextExpectedDate: row.next_expected_date,
    detectionState: row.detection_state,
    renewalIntent: row.renewal_intent,
    categoryId: row.category_id,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapReserve(row: ReserveRow): SubscriptionReservePlan {
  return createReservePlan({
    id: row.id,
    subscriptionId: row.subscription_id,
    targetAmountMinor: row.target_amount_minor,
    targetCurrency: row.target_currency,
    reservedAmountMinor: row.reserved_amount_minor,
    targetDate: row.target_date,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function formatMoneyValue(value: ReturnType<typeof money>): string {
  return formatMoney(value, 'en-GB');
}
