import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMonzoConnectionSummary } from '../src/app/settings';
import { migrateDatabase } from '../src/data/migrations';
import { MemorySecureTokenStore } from '../src/integrations/monzo/memory-secure-store';
import { MockMonzoApi } from '../src/integrations/monzo/mock';
import {
  syncMonzo,
  toSyncFailure,
  wipeMonzoConnection,
  type MonzoApi,
} from '../src/integrations/monzo/sync';
import {
  MonzoTransportError,
  withMonzoRetry,
} from '../src/integrations/monzo/transport';
import { NodeDatabase } from './support/node-database';

const NOW = '2026-09-24T19:00:00.000Z';
const ACCOUNT = {
  id: 'acc_synthetic',
  description: 'Synthetic account',
  created: '2026-01-01T00:00:00.000Z',
};

describe('Monzo local sync', () => {
  let database: NodeDatabase;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
  });

  afterEach(() => database.close());

  it('performs immediate full-history sync and persists restart-safe state', async () => {
    const api = apiWithTransactions([
      transaction('tx_old', -1_000, '2020-01-01T00:00:00.000Z'),
      transaction('tx_new', 2_000, '2026-09-24T18:00:00.000Z'),
    ]);

    await expect(
      syncMonzo(database, api, {
        source: 'monzo_mock',
        authenticatedAt: '2026-09-24T18:58:00.000Z',
        now: NOW,
      }),
    ).resolves.toEqual({
      accounts: 1,
      pots: 1,
      transactions: 2,
      pages: 1,
      mode: 'INITIAL',
      history: 'FULL',
    });

    expect(api.requests[0]).toMatchObject({ since: null, limit: 100 });
    expect(await getMonzoConnectionSummary(database)).toEqual({
      authState: 'DEMO_NOT_CONNECTED',
      networkEnabled: false,
      mockLastSyncedAt: NOW,
      mockHistory: 'FULL',
    });
  });

  it('reports pagination and progress before committing', async () => {
    const api = apiWithTransactions([
      transaction('tx_page', -100, '2026-09-20T00:00:00.000Z'),
    ]);
    api.nextCursor = 'next';
    const phases: string[] = [];

    const result = await syncMonzo(database, api, {
      source: 'monzo_mock',
      authenticatedAt: NOW,
      now: NOW,
      onProgress: ({ phase, pages }) => phases.push(`${phase}:${pages}`),
    });

    expect(result.pages).toBe(2);
    expect(phases).toEqual([
      'FETCHING_ACCOUNTS:0',
      'FETCHING_POTS:0',
      'FETCHING_TRANSACTIONS:1',
      'FETCHING_TRANSACTIONS:2',
      'COMMITTING:2',
    ]);
  });

  it('runs the two-page development mock idempotently', async () => {
    const first = await syncMonzo(database, new MockMonzoApi(), {
      source: 'monzo_mock',
      authenticatedAt: NOW,
      now: NOW,
    });
    const second = await syncMonzo(database, new MockMonzoApi(), {
      source: 'monzo_mock',
      authenticatedAt: NOW,
      now: '2026-09-24T20:00:00.000Z',
    });

    expect(first).toMatchObject({ mode: 'INITIAL', pages: 2, transactions: 2 });
    expect(second).toMatchObject({
      mode: 'INCREMENTAL',
      pages: 2,
      transactions: 1,
    });
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count FROM raw_transactions
         WHERE source = 'monzo_mock';`,
      ),
    ).toEqual({ count: 2 });
  });

  it('models the post-five-minute initial import as partial 90-day history', async () => {
    const api = apiWithTransactions([]);
    const result = await syncMonzo(database, api, {
      source: 'monzo_mock',
      authenticatedAt: '2026-09-24T18:00:00.000Z',
      now: NOW,
    });

    expect(result.history).toBe('LAST_90_DAYS');
    expect(api.requests[0]?.since).toBe('2026-06-26T19:00:00.000Z');
    expect(await getMonzoConnectionSummary(database)).toMatchObject({
      mockHistory: 'PARTIAL',
    });
  });

  it('uses persisted cursor time for incremental sync and idempotent upsert', async () => {
    const first = apiWithTransactions([
      transaction('tx_same', -100, '2026-09-20T00:00:00.000Z'),
    ]);
    await syncMonzo(database, first, {
      source: 'monzo_mock',
      authenticatedAt: NOW,
      now: NOW,
    });
    const second = apiWithTransactions([
      {
        ...transaction('tx_same', -100, '2026-09-20T00:00:00.000Z'),
        settled: '2026-09-21T00:00:00.000Z',
        deleted: true,
      },
    ]);
    const result = await syncMonzo(database, second, {
      source: 'monzo_mock',
      authenticatedAt: NOW,
      now: '2026-09-25T19:00:00.000Z',
    });

    expect(result.mode).toBe('INCREMENTAL');
    expect(second.requests[0]?.since).toBe('2026-09-13T00:00:00.000Z');
    expect(
      await database.getAllAsync<{
        settled_at: string;
        source_deleted: number;
      }>(
        `SELECT settled_at, source_deleted FROM raw_transactions
         WHERE source = 'monzo_mock';`,
      ),
    ).toEqual([
      {
        settled_at: '2026-09-21T00:00:00.000Z',
        source_deleted: 1,
      },
    ]);
  });

  it('uses overlap to refresh an older pending transaction after a newer cursor', async () => {
    await syncMonzo(
      database,
      apiWithTransactions([
        transaction('tx_pending', -100, '2026-09-18T00:00:00.000Z'),
        transaction('tx_newer', -200, '2026-09-20T00:00:00.000Z'),
      ]),
      { source: 'monzo_mock', authenticatedAt: NOW, now: NOW },
    );
    const update = apiWithTransactions([
      {
        ...transaction('tx_pending', -100, '2026-09-18T00:00:00.000Z'),
        settled: '2026-09-21T00:00:00.000Z',
      },
    ]);

    await syncMonzo(database, update, {
      source: 'monzo_mock',
      authenticatedAt: NOW,
      now: '2026-09-25T19:00:00.000Z',
    });

    expect(update.requests[0]?.since).toBe('2026-09-13T00:00:00.000Z');
    expect(
      await database.getFirstAsync<{ settled_at: string }>(
        `SELECT settled_at FROM raw_transactions
         WHERE source_transaction_id = 'tx_pending';`,
      ),
    ).toEqual({ settled_at: '2026-09-21T00:00:00.000Z' });
  });

  it('advances a successful partial import to incremental mode', async () => {
    await syncMonzo(
      database,
      apiWithTransactions([
        transaction('tx_partial', -100, '2026-09-20T00:00:00.000Z'),
      ]),
      {
        source: 'monzo_mock',
        authenticatedAt: '2026-09-24T18:00:00.000Z',
        now: NOW,
      },
    );
    const second = apiWithTransactions([]);
    const result = await syncMonzo(database, second, {
      source: 'monzo_mock',
      authenticatedAt: '2026-09-24T18:00:00.000Z',
      now: '2026-09-25T19:00:00.000Z',
    });

    expect(result).toMatchObject({
      mode: 'INCREMENTAL',
      history: 'LAST_90_DAYS',
    });
    expect(second.requests[0]?.since).toBe('2026-09-13T00:00:00.000Z');
  });

  it('reports partial history when any persisted account is incomplete', async () => {
    for (const id of ['acc_full', 'acc_partial']) {
      await database.runAsync(
        `INSERT INTO monzo_source_accounts (
          id, description, created_at, closed, last_synced_at
        ) VALUES (?, ?, ?, 0, ?);`,
        id,
        id,
        '2026-01-01T00:00:00.000Z',
        NOW,
      );
    }
    await database.runAsync(
      `INSERT INTO monzo_sync_state (
        account_id, phase, initial_history_complete, last_completed_at
      ) VALUES
        ('acc_full', 'READY', 1, ?),
        ('acc_partial', 'PARTIAL_HISTORY', 0, ?);`,
      NOW,
      NOW,
    );

    expect(await getMonzoConnectionSummary(database)).toMatchObject({
      mockHistory: 'PARTIAL',
      mockLastSyncedAt: NOW,
    });
  });

  it('does not persist partial pages when a later page fails', async () => {
    const api = apiWithTransactions([
      transaction('tx_first_page', -100, '2026-09-20T00:00:00.000Z'),
    ]);
    api.nextCursor = 'next';
    api.failCursor = 'next';

    await expect(
      syncMonzo(database, api, {
        source: 'monzo_mock',
        authenticatedAt: NOW,
        now: NOW,
      }),
    ).rejects.toThrow('SYNTHETIC_PAGE_FAILURE');
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count FROM raw_transactions
         WHERE source = 'monzo_mock';`,
      ),
    ).toEqual({ count: 0 });
  });

  it('cancels before persistence and reports an explicit cancelled state', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(
      syncMonzo(database, apiWithTransactions([transaction('tx', -100, NOW)]), {
        source: 'monzo_mock',
        authenticatedAt: NOW,
        now: NOW,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count FROM raw_transactions
         WHERE source = 'monzo_mock';`,
      ),
    ).toEqual({ count: 0 });
  });

  it('surfaces offline and rate-limit failures without converting them to success', async () => {
    const offline = apiWithTransactions([]);
    offline.error = new MonzoTransportError('OFFLINE');
    await expect(
      syncMonzo(database, offline, {
        source: 'monzo_mock',
        authenticatedAt: NOW,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE' });

    const operation = vi
      .fn<(_: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new MonzoTransportError('RATE_LIMITED', 1_000))
      .mockResolvedValue('ok');
    const sleeps: number[] = [];
    await expect(
      withMonzoRetry(operation, {
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      }),
    ).resolves.toBe('ok');
    expect(sleeps).toEqual([1_000]);
    expect(
      toSyncFailure(new MonzoTransportError('RATE_LIMITED', 4_000)),
    ).toEqual({
      phase: 'RATE_LIMITED',
      code: 'RATE_LIMITED',
      retryAfterMs: 4_000,
    });
    expect(
      toSyncFailure(new DOMException('cancelled', 'AbortError')),
    ).toMatchObject({ phase: 'CANCELLED', code: 'CANCELLED' });
  });

  it('wipes tokens, sync state, source objects, and mock raw records', async () => {
    await syncMonzo(
      database,
      apiWithTransactions([transaction('tx', -100, NOW)]),
      {
        source: 'monzo_mock',
        authenticatedAt: NOW,
        now: NOW,
      },
    );
    const tokens = new MemorySecureTokenStore();
    await tokens.write({
      accessToken: 'synthetic-access',
      refreshToken: null,
      expiresAt: '2026-09-25T00:00:00.000Z',
    });

    await wipeMonzoConnection(database, tokens);

    expect(await tokens.read()).toBeNull();
    expect(
      await database.getFirstAsync<{ count: number }>(
        `SELECT count(*) AS count FROM raw_transactions
         WHERE source IN ('monzo', 'monzo_mock');`,
      ),
    ).toEqual({ count: 0 });
    expect(await getMonzoConnectionSummary(database)).toMatchObject({
      mockHistory: 'NONE',
    });
  });

  it('fails closed when secure storage cannot be deleted', async () => {
    const tokens = new MemorySecureTokenStore();
    tokens.failOperations = true;
    await expect(wipeMonzoConnection(database, tokens)).rejects.toMatchObject({
      code: 'SECURE_STORE_UNAVAILABLE',
    });
  });
});

type Transaction = {
  readonly id: string;
  readonly account_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  readonly created: string;
  readonly settled?: string;
  readonly deleted?: boolean;
};

function transaction(id: string, amount: number, created: string): Transaction {
  return {
    id,
    account_id: ACCOUNT.id,
    amount,
    currency: 'GBP',
    description: `SYNTHETIC ${id}`,
    created,
  };
}

function apiWithTransactions(transactions: readonly Transaction[]) {
  const api: MonzoApi & {
    requests: {
      since: string | null;
      cursor: string | null;
      limit: 100;
    }[];
    nextCursor: string | null;
    failCursor: string | null;
    error: Error | null;
  } = {
    requests: [],
    nextCursor: null,
    failCursor: null,
    error: null,
    async listAccounts() {
      if (this.error !== null) throw this.error;
      return { accounts: [ACCOUNT] };
    },
    async listPots() {
      return {
        pots: [
          {
            id: 'pot_synthetic',
            name: 'Synthetic savings',
            balance: 10_000,
            currency: 'GBP',
            created: '2026-01-02T00:00:00.000Z',
            updated: NOW,
            deleted: false,
          },
        ],
      };
    },
    async listTransactions(_accountId, request) {
      this.requests.push(request);
      if (request.cursor === this.failCursor && this.failCursor !== null) {
        throw new Error('SYNTHETIC_PAGE_FAILURE');
      }
      return {
        transactions,
        nextCursor: request.cursor === null ? this.nextCursor : null,
      };
    },
  };
  return api;
}
