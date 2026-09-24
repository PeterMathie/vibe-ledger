import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  confirmSubscriptionSuggestion,
  denySubscriptionSuggestion,
  detectSubscriptionSuggestions,
  disableSubscription,
  listSubscriptions,
  saveReservePlan,
  saveSubscription,
  saveSubscriptionDetails,
  summarizeSubscriptions,
} from '../src/data/subscription-repository';
import {
  importDemoData,
  loadLedgerSnapshot,
  queryLedgerTransactions,
  queryLedgerTrends,
  resetDemoData,
} from '../src/data/demo-repository';
import { MIGRATIONS, migrateDatabase } from '../src/data/migrations';
import {
  addInterval,
  createSubscription,
  formatMonthlyEquivalent,
  monthlyEquivalent,
  requiredMonthlyReserve,
  roundExactMinor,
} from '../src/domain/subscriptions';
import { monthQuery } from '../src/domain/query';
import { NodeDatabase } from './support/node-database';

const CLOCK = '2026-09-24T12:00:00.000Z';

describe('subscription arithmetic and interval rules', () => {
  it('covers K1 and K2 with exact rational internals and display-only rounding', () => {
    const annual = subscription({ amount: 9_000, currency: 'GBP', months: 12 });
    const twoYear = subscription({
      amount: 20_000,
      currency: 'USD',
      months: 24,
    });

    expect(monthlyEquivalent(annual)).toEqual({
      numeratorMinor: 9_000n,
      denominator: 12n,
      currency: 'GBP',
    });
    expect(roundExactMinor(monthlyEquivalent(annual)).amountMinor).toBe(750);
    expect(formatMonthlyEquivalent(annual)).toBe('£7.50/month');
    expect(monthlyEquivalent(twoYear)).toEqual({
      numeratorMinor: 20_000n,
      denominator: 24n,
      currency: 'USD',
    });
    expect(roundExactMinor(monthlyEquivalent(twoYear))).toMatchObject({
      amountMinor: 833,
      currency: 'USD',
    });
  });

  it('supports arbitrary month and day intervals with calendar-safe renewal dates', () => {
    for (const months of [1, 3, 6, 12, 24]) {
      expect(
        createSubscription(
          input({ intervalMonths: months, intervalDays: null }),
        ).intervalMonths,
      ).toBe(months);
    }
    expect(
      addInterval('2026-01-31', { intervalMonths: 1, intervalDays: null }),
    ).toBe('2026-02-28');
    expect(
      addInterval('2026-02-01', { intervalMonths: null, intervalDays: 28 }),
    ).toBe('2026-03-01');
    expect(
      monthlyEquivalent(
        subscription({ amount: 2_800, currency: 'GBP', days: 28 }),
      ),
    ).toEqual({
      numeratorMinor: 136_357_200n,
      denominator: 44_800n,
      currency: 'GBP',
    });
  });

  it('rejects empty, dual, zero, and fractional intervals', () => {
    expect(() =>
      createSubscription(input({ intervalMonths: null, intervalDays: null })),
    ).toThrow('exactly one');
    expect(() =>
      createSubscription(input({ intervalMonths: 1, intervalDays: 30 })),
    ).toThrow('exactly one');
    expect(() =>
      createSubscription(input({ intervalMonths: 0, intervalDays: null })),
    ).toThrow('positive integer');
    expect(() =>
      createSubscription(input({ intervalMonths: 1.5, intervalDays: null })),
    ).toThrow('positive integer');
  });

  it('covers K3 and K4 reserve edge cases without creating money events', () => {
    expect(
      roundExactMinor(
        requiredMonthlyReserve(
          {
            targetAmountMinor: 9_000,
            targetCurrency: 'GBP',
            reservedAmountMinor: 3_000,
            targetDate: '2027-03-24',
          },
          '2026-09-24',
        ),
      ).amountMinor,
    ).toBe(1_000);
    expect(
      roundExactMinor(
        requiredMonthlyReserve(
          {
            targetAmountMinor: 9_000,
            targetCurrency: 'GBP',
            reservedAmountMinor: 10_000,
            targetDate: '2026-09-24',
          },
          '2026-09-24',
        ),
      ).amountMinor,
    ).toBe(0);
    expect(() =>
      requiredMonthlyReserve(
        {
          targetAmountMinor: 9_000,
          targetCurrency: 'GBP',
          reservedAmountMinor: 0,
          targetDate: '2026-09-24',
        },
        '2026-09-24',
      ),
    ).toThrow('at least one month');
  });
});

describe('subscription repository, detector, and drill-down', () => {
  let database: NodeDatabase;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
    await importDemoData(database);
  });

  afterEach(() => database.close());

  it('loads currency-partitioned fixture summaries and renewal windows', async () => {
    const records = await listSubscriptions(database, '2026-09-24', true);
    const summaries = summarizeSubscriptions(records, '2026-09-24');

    expect(records.map(({ subscription }) => subscription.id)).toEqual(
      expect.arrayContaining([
        'demo-subscription:studio-annual',
        'demo-subscription:global-tool',
        'demo-subscription:piano',
        'demo-subscription:old-news',
      ]),
    );
    expect(summaries.map(({ currency }) => currency)).toEqual(['GBP', 'USD']);
    expect(summaries.find(({ currency }) => currency === 'USD')).toMatchObject({
      totalMonthlyEquivalentMinor: 833,
      longIntervalMonthlyEquivalentMinor: 833,
    });
    expect(summaries.find(({ currency }) => currency === 'GBP')).toMatchObject({
      renewalsIn30Days: 1,
      renewalsIn90Days: 1,
    });
  });

  it('detects amount drift and repeated intervals but rejects irregular evidence', async () => {
    const suggestions = await detectSubscriptionSuggestions(database);
    const music = suggestions.find(({ name }) => name === 'Melody Music');

    expect(music).toMatchObject({
      billingCurrency: 'GBP',
      billingAmountMinor: 1_199,
      intervalMonths: 1,
      intervalDays: null,
      evidenceCount: 3,
      confidence: 'MEDIUM',
    });
    expect(suggestions.map(({ name }) => name)).not.toContain('Market Club');
  });

  it('requires explicit confirmation or denial of a suggestion', async () => {
    const suggestion = (await detectSubscriptionSuggestions(database)).find(
      ({ name }) => name === 'Melody Music',
    );
    expect(suggestion).toBeDefined();
    if (suggestion === undefined) {
      return;
    }
    await denySubscriptionSuggestion(database, suggestion.signature, CLOCK);
    expect(
      (await detectSubscriptionSuggestions(database)).map(
        ({ signature }) => signature,
      ),
    ).not.toContain(suggestion.signature);
    const before = await database.getFirstAsync<{ count: number }>(
      'SELECT count(*) AS count FROM subscriptions;',
    );
    await confirmSubscriptionSuggestion(
      database,
      suggestion,
      'test:confirmed-music',
      CLOCK,
    );
    expect(
      await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) AS count FROM subscriptions;',
      ),
    ).toEqual({ count: (before?.count ?? 0) + 1 });
    const drillDown = await queryLedgerTransactions(
      database,
      {
        ...monthQuery('2026-03'),
        subscriptionId: 'test:confirmed-music',
      },
      'GBP',
    );
    expect(drillDown.matches.map(({ raw }) => raw.id)).toEqual([
      'demo:music-monthly-march',
    ]);
    expect(
      (
        await queryLedgerTransactions(
          database,
          monthQuery('2026-03', {
            subscriptionStatuses: ['CONFIRMED'],
          }),
          'GBP',
        )
      ).matches.map(({ raw }) => raw.id),
    ).toContain('demo:music-monthly-march');

    await disableSubscription(database, 'test:confirmed-music', CLOCK);
    expect(
      (await listSubscriptions(database, '2026-09-24', true)).find(
        ({ subscription }) => subscription.id === 'test:confirmed-music',
      )?.subscription.active,
    ).toBe(false);
  });

  it('resets demo transactions after a suggestion is confirmed without deleting the user record', async () => {
    const suggestion = (await detectSubscriptionSuggestions(database)).find(
      ({ name }) => name === 'Melody Music',
    );
    if (suggestion === undefined) {
      throw new Error('Expected recurring suggestion.');
    }
    await confirmSubscriptionSuggestion(
      database,
      suggestion,
      'user:confirmed-demo',
      CLOCK,
    );
    await resetDemoData(database);

    expect(
      await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM subscriptions WHERE id = ?;',
        'user:confirmed-demo',
      ),
    ).toEqual({ id: 'user:confirmed-demo' });
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count FROM subscription_transactions
         WHERE subscription_id = 'user:confirmed-demo';`,
      ),
    ).toEqual({ count: 0 });
  });

  it('keeps reserve metadata and subscription CRUD out of Home actuals', async () => {
    const before = await loadLedgerSnapshot(database, '2026-09');
    const trendsBefore = await queryLedgerTrends(
      database,
      {
        startMonth: '2026-01',
        endMonth: '2026-09',
        selection: { kind: 'OVERALL' },
      },
      'GBP',
    );
    const rawCount = await database.getFirstAsync<{ count: number }>(
      'SELECT count(*) AS count FROM raw_transactions;',
    );
    await saveSubscription(
      database,
      input({
        id: 'test:manual',
        intervalMonths: 6,
        intervalDays: null,
        renewalIntent: 'UNKNOWN',
      }),
    );
    await saveReservePlan(database, {
      id: 'test:reserve',
      subscriptionId: 'test:manual',
      targetAmountMinor: 12_000,
      targetCurrency: 'GBP',
      reservedAmountMinor: 2_000,
      targetDate: '2027-09-24',
      createdAt: CLOCK,
      updatedAt: CLOCK,
    });
    const after = await loadLedgerSnapshot(database, '2026-09');
    const trendsAfter = await queryLedgerTrends(
      database,
      {
        startMonth: '2026-01',
        endMonth: '2026-09',
        selection: { kind: 'OVERALL' },
      },
      'GBP',
    );

    expect(after.ledgerMonth?.summary).toEqual(before.ledgerMonth?.summary);
    expect(trendsAfter).toEqual(trendsBefore);
    expect(
      await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) AS count FROM raw_transactions;',
      ),
    ).toEqual(rawCount);
  });

  it('enforces reserve currency safety', async () => {
    await saveSubscription(
      database,
      input({ id: 'test:currency', intervalMonths: 1, intervalDays: null }),
    );
    await expect(
      saveReservePlan(database, {
        id: 'test:bad-reserve',
        subscriptionId: 'test:currency',
        targetAmountMinor: 100,
        targetCurrency: 'USD',
        reservedAmountMinor: 0,
        targetDate: '2027-09-24',
        createdAt: CLOCK,
        updatedAt: CLOCK,
      }),
    ).rejects.toThrow('must match');
  });

  it('keeps subscription and reserve edits atomic and represents overdue reserves', async () => {
    await saveSubscription(
      database,
      input({
        id: 'test:atomic',
        name: 'Original',
        intervalMonths: 1,
        intervalDays: null,
      }),
    );
    await expect(
      saveSubscriptionDetails(
        database,
        input({
          id: 'test:atomic',
          name: 'Must roll back',
          intervalMonths: 3,
          intervalDays: null,
        }),
        {
          id: 'test:atomic-reserve',
          subscriptionId: 'test:atomic',
          targetAmountMinor: 1_000,
          targetCurrency: 'GBP',
          reservedAmountMinor: 0,
          targetDate: 'not-a-date',
          createdAt: CLOCK,
          updatedAt: CLOCK,
        },
      ),
    ).rejects.toThrow('valid YYYY-MM-DD');
    expect(
      (await listSubscriptions(database, '2026-09-24', true)).find(
        ({ subscription }) => subscription.id === 'test:atomic',
      )?.subscription,
    ).toMatchObject({ name: 'Original', intervalMonths: 1 });

    await saveReservePlan(database, {
      id: 'test:overdue',
      subscriptionId: 'test:atomic',
      targetAmountMinor: 1_000,
      targetCurrency: 'GBP',
      reservedAmountMinor: 0,
      targetDate: '2026-09-24',
      createdAt: CLOCK,
      updatedAt: CLOCK,
    });
    expect(
      (await listSubscriptions(database, '2026-09-24', true)).find(
        ({ subscription }) => subscription.id === 'test:atomic',
      )?.requiredReserveLabel,
    ).toBe('Due now');
  });

  it('rounds exact summary buckets only after aggregation', async () => {
    for (const id of ['test:round-one', 'test:round-two']) {
      await saveSubscription(
        database,
        input({
          id,
          billingAmountMinor: 6,
          intervalMonths: 12,
          intervalDays: null,
        }),
      );
    }
    const records = (
      await listSubscriptions(database, '2026-09-24', true)
    ).filter(({ subscription }) => subscription.id.startsWith('test:round-'));
    expect(summarizeSubscriptions(records, '2026-09-24')[0]).toMatchObject({
      longIntervalMonthlyEquivalentMinor: 1,
      totalMonthlyEquivalentMinor: 1,
      exactMonthlyEquivalent: {
        numeratorMinor: 1n,
        denominator: 1n,
      },
    });
  });
});

describe('subscription migration and restart persistence', () => {
  it('upgrades migration 3 additively and preserves prior data', async () => {
    const database = new NodeDatabase();
    try {
      for (const migration of MIGRATIONS.filter(
        ({ version }) => version <= 3,
      )) {
        await database.execAsync(migration.sql);
        await database.execAsync(`PRAGMA user_version = ${migration.version};`);
      }
      await database.runAsync(
        `INSERT INTO raw_transactions (
          id, source, source_transaction_id, amount_minor, currency, description,
          created_at, raw_payload_json, first_seen_at, last_synced_at
        ) VALUES ('legacy', 'test', 'legacy', -100, 'GBP', 'LEGACY',
          '2026-01-01', '{}', '2026-01-01', '2026-01-01');`,
      );
      await migrateDatabase(database);
      expect(
        await database.getFirstAsync<{ id: string }>(
          'SELECT id FROM raw_transactions WHERE id = ?;',
          'legacy',
        ),
      ).toEqual({ id: 'legacy' });
      expect(
        await database.getFirstAsync<{ user_version: number }>(
          'PRAGMA user_version;',
        ),
      ).toEqual({ user_version: 4 });
    } finally {
      database.close();
    }
  });

  it('persists edits and disabled state across a real database restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'vibe-subscriptions-'));
    const path = join(directory, 'ledger.sqlite');
    try {
      const first = new NodeDatabase(path);
      await migrateDatabase(first);
      await saveSubscription(
        first,
        input({ id: 'restart', intervalMonths: 3, intervalDays: null }),
      );
      await saveSubscription(
        first,
        input({
          id: 'restart',
          name: 'Edited locally',
          intervalMonths: 6,
          intervalDays: null,
        }),
      );
      await disableSubscription(first, 'restart', CLOCK);
      first.close();

      const second = new NodeDatabase(path);
      await migrateDatabase(second);
      expect(
        (await listSubscriptions(second, '2026-09-24', true))[0]?.subscription,
      ).toMatchObject({
        id: 'restart',
        name: 'Edited locally',
        intervalMonths: 6,
        active: false,
      });
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function subscription({
  amount,
  currency,
  months,
  days,
}: {
  readonly amount: number;
  readonly currency: string;
  readonly months?: number;
  readonly days?: number;
}) {
  return createSubscription(
    input({
      billingAmountMinor: amount,
      billingCurrency: currency,
      intervalMonths: months ?? null,
      intervalDays: days ?? null,
    }),
  );
}

function input(
  overrides: Partial<Parameters<typeof createSubscription>[0]> = {},
): Parameters<typeof createSubscription>[0] {
  return {
    id: 'test:subscription',
    name: 'Test subscription',
    merchantMatch: 'test',
    billingAmountMinor: 9_000,
    billingCurrency: 'GBP',
    intervalMonths: 12,
    intervalDays: null,
    lastPaymentDate: '2026-09-01',
    nextExpectedDate: '2027-09-01',
    detectionState: 'MANUAL',
    renewalIntent: 'COMMITTED',
    categoryId: 'category:subscriptions',
    createdAt: CLOCK,
    updatedAt: CLOCK,
    ...overrides,
  };
}
