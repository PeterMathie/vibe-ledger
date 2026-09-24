import type { Database } from '../../data/database';
import type { RawTransaction } from '../../domain/types';
import {
  mapMonzoAccount,
  mapMonzoPot,
  mapMonzoTransaction,
  type MonzoRawSource,
} from './adapter';
import type {
  MonzoAccountPage,
  MonzoPotPage,
  MonzoTransactionPage,
} from './dto';
import type { SecureTokenStore } from './secure-store-types';
import { MonzoTransportError } from './transport';

export const INITIAL_HISTORY_WINDOW_MS = 5 * 60 * 1000;
export const INCREMENTAL_HISTORY_DAYS = 90;
export const INCREMENTAL_CURSOR_OVERLAP_DAYS = 7;

export type SyncPhase =
  | 'NOT_STARTED'
  | 'INITIAL_REQUIRED'
  | 'SYNCING_INITIAL'
  | 'READY'
  | 'SYNCING_INCREMENTAL'
  | 'PARTIAL_HISTORY'
  | 'RATE_LIMITED'
  | 'OFFLINE'
  | 'CANCELLED'
  | 'ERROR';

export interface SyncFailure {
  readonly phase: 'RATE_LIMITED' | 'OFFLINE' | 'CANCELLED' | 'ERROR';
  readonly code: string;
  readonly retryAfterMs: number | null;
}

export interface MonzoApi {
  listAccounts(signal?: AbortSignal): Promise<MonzoAccountPage>;
  listPots(accountId: string, signal?: AbortSignal): Promise<MonzoPotPage>;
  listTransactions(
    accountId: string,
    request: {
      readonly since: string | null;
      readonly cursor: string | null;
      readonly limit: 100;
    },
    signal?: AbortSignal,
  ): Promise<MonzoTransactionPage>;
}

export interface SyncResult {
  readonly accounts: number;
  readonly pots: number;
  readonly transactions: number;
  readonly mode: 'INITIAL' | 'INCREMENTAL';
  readonly history: 'FULL' | 'LAST_90_DAYS';
}

export interface SyncOptions {
  readonly source?: MonzoRawSource;
  readonly authenticatedAt: string;
  readonly now: string;
  readonly signal?: AbortSignal;
}

interface SyncStateRow {
  readonly account_id: string;
  readonly cursor_created_at: string | null;
  readonly initial_history_complete: number;
  readonly last_completed_at: string | null;
}

export async function syncMonzo(
  database: Database,
  api: MonzoApi,
  options: SyncOptions,
): Promise<SyncResult> {
  const now = validTimestamp(options.now, 'SYNC_INVALID_NOW');
  const authenticatedAt = validTimestamp(
    options.authenticatedAt,
    'SYNC_INVALID_AUTH_TIME',
  );
  const source = options.source ?? 'monzo';
  const accountPage = await api.listAccounts(options.signal);
  const accounts = accountPage.accounts.map(mapMonzoAccount);
  const pots = (
    await Promise.all(
      accounts.map(async (account) =>
        (await api.listPots(account.id, options.signal)).pots.map((pot) =>
          mapMonzoPot(account.id, pot),
        ),
      ),
    )
  ).flat();
  const existing = await database.getAllAsync<SyncStateRow>(
    `SELECT account_id, cursor_created_at, initial_history_complete,
            last_completed_at
     FROM monzo_sync_state;`,
  );
  const byAccount = new Map(existing.map((row) => [row.account_id, row]));
  const initial = accounts.some(
    (account) => byAccount.get(account.id)?.last_completed_at == null,
  );
  const withinInitialWindow =
    new Date(now).valueOf() - new Date(authenticatedAt).valueOf() <=
    INITIAL_HISTORY_WINDOW_MS;
  const accountHistory = new Map<string, 'FULL' | 'LAST_90_DAYS'>();
  const transactions: RawTransaction[] = [];

  for (const account of accounts) {
    const state = byAccount.get(account.id);
    const accountInitial = state?.last_completed_at == null;
    const fullHistory = accountInitial
      ? withinInitialWindow
      : state.initial_history_complete === 1;
    accountHistory.set(account.id, fullHistory ? 'FULL' : 'LAST_90_DAYS');
    const since = accountInitial
      ? fullHistory
        ? null
        : daysBefore(now, INCREMENTAL_HISTORY_DAYS)
      : incrementalSince(state.cursor_created_at, now);
    let cursor: string | null = null;
    do {
      options.signal?.throwIfAborted();
      const page = await api.listTransactions(
        account.id,
        { since, cursor, limit: 100 },
        options.signal,
      );
      transactions.push(
        ...page.transactions.map((transaction) =>
          mapMonzoTransaction(account.id, transaction, now, source),
        ),
      );
      cursor = page.nextCursor;
    } while (cursor !== null);
  }

  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    for (const account of accounts) {
      await database.runAsync(
        `INSERT INTO monzo_source_accounts (
          id, description, created_at, account_type, closed, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          description = excluded.description,
          account_type = excluded.account_type,
          closed = excluded.closed,
          last_synced_at = excluded.last_synced_at;`,
        account.id,
        account.description,
        account.createdAt,
        account.accountType,
        account.closed ? 1 : 0,
        now,
      );
    }
    for (const pot of pots) {
      await database.runAsync(
        `INSERT INTO monzo_source_pots (
          id, account_id, name, balance_minor, currency, created_at, updated_at,
          deleted, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          account_id = excluded.account_id,
          name = excluded.name,
          balance_minor = excluded.balance_minor,
          currency = excluded.currency,
          updated_at = excluded.updated_at,
          deleted = excluded.deleted,
          last_synced_at = excluded.last_synced_at;`,
        pot.id,
        pot.accountId,
        pot.name,
        pot.balanceMinor,
        pot.currency,
        pot.createdAt,
        pot.updatedAt,
        pot.deleted ? 1 : 0,
        now,
      );
    }
    for (const transaction of transactions) {
      await upsertRawTransaction(database, transaction);
    }
    for (const account of accounts) {
      const accountTransactions = transactions.filter(
        ({ sourceAccountId }) => sourceAccountId === account.id,
      );
      const last = [...accountTransactions].sort(compareRaw).at(-1);
      await database.runAsync(
        `INSERT INTO monzo_sync_state (
          account_id, phase, cursor_created_at, cursor_transaction_id,
          initial_history_complete, last_started_at, last_completed_at,
          error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(account_id) DO UPDATE SET
          phase = excluded.phase,
          cursor_created_at = COALESCE(excluded.cursor_created_at, cursor_created_at),
          cursor_transaction_id = COALESCE(excluded.cursor_transaction_id, cursor_transaction_id),
          initial_history_complete = max(initial_history_complete, excluded.initial_history_complete),
          last_started_at = excluded.last_started_at,
          last_completed_at = excluded.last_completed_at,
          error_code = NULL;`,
        account.id,
        accountHistory.get(account.id) === 'FULL' ? 'READY' : 'PARTIAL_HISTORY',
        last?.createdAt ?? null,
        last?.sourceTransactionId ?? null,
        accountHistory.get(account.id) === 'FULL' ? 1 : 0,
        now,
        now,
      );
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }

  return {
    accounts: accounts.length,
    pots: pots.length,
    transactions: transactions.length,
    mode: initial ? 'INITIAL' : 'INCREMENTAL',
    history: [...accountHistory.values()].every((value) => value === 'FULL')
      ? 'FULL'
      : 'LAST_90_DAYS',
  };
}

export async function wipeMonzoConnection(
  database: Database,
  tokenStore: SecureTokenStore,
): Promise<void> {
  await tokenStore.delete();
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await database.execAsync(`
      DELETE FROM subscription_transactions
      WHERE raw_transaction_id IN (
        SELECT id FROM raw_transactions WHERE source IN ('monzo', 'monzo_mock')
      );
      DELETE FROM transaction_splits
      WHERE raw_transaction_id IN (
        SELECT id FROM raw_transactions WHERE source IN ('monzo', 'monzo_mock')
      );
      DELETE FROM classification_changes
      WHERE raw_transaction_id IN (
        SELECT id FROM raw_transactions WHERE source IN ('monzo', 'monzo_mock')
      );
      UPDATE transaction_classifications SET offset_raw_transaction_id = NULL
      WHERE offset_raw_transaction_id IN (
        SELECT id FROM raw_transactions WHERE source IN ('monzo', 'monzo_mock')
      );
      DELETE FROM transaction_classifications
      WHERE raw_transaction_id IN (
        SELECT id FROM raw_transactions WHERE source IN ('monzo', 'monzo_mock')
      );
      DELETE FROM raw_transactions WHERE source IN ('monzo', 'monzo_mock');
      DELETE FROM monzo_sync_state;
      DELETE FROM monzo_source_pots;
      DELETE FROM monzo_source_accounts;
    `);
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

export function toSyncFailure(error: unknown): SyncFailure {
  if (error instanceof MonzoTransportError) {
    return {
      phase:
        error.code === 'OFFLINE'
          ? 'OFFLINE'
          : error.code === 'RATE_LIMITED'
            ? 'RATE_LIMITED'
            : 'ERROR',
      code: error.code,
      retryAfterMs: error.retryAfterMs,
    };
  }
  if (
    (typeof DOMException !== 'undefined' && error instanceof DOMException) ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return { phase: 'CANCELLED', code: 'CANCELLED', retryAfterMs: null };
  }
  return { phase: 'ERROR', code: 'SYNC_FAILED', retryAfterMs: null };
}

async function upsertRawTransaction(
  database: Database,
  transaction: RawTransaction,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO raw_transactions (
      id, source, source_transaction_id, source_account_id, amount_minor,
      currency, description, merchant_id, merchant_name, source_category,
      created_at, settled_at, raw_payload_json, first_seen_at, last_synced_at,
      source_deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_transaction_id) DO UPDATE SET
      source_account_id = excluded.source_account_id,
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      description = excluded.description,
      merchant_id = excluded.merchant_id,
      merchant_name = excluded.merchant_name,
      source_category = excluded.source_category,
      created_at = excluded.created_at,
      settled_at = excluded.settled_at,
      raw_payload_json = excluded.raw_payload_json,
      last_synced_at = excluded.last_synced_at,
      source_deleted = excluded.source_deleted;`,
    transaction.id,
    transaction.source,
    transaction.sourceTransactionId,
    transaction.sourceAccountId,
    transaction.amountMinor,
    transaction.currency,
    transaction.description,
    transaction.merchantId,
    transaction.merchantName,
    transaction.sourceCategory,
    transaction.createdAt,
    transaction.settledAt,
    transaction.rawPayloadJson,
    transaction.firstSeenAt,
    transaction.lastSyncedAt,
    transaction.sourceDeleted ? 1 : 0,
  );
}

function compareRaw(left: RawTransaction, right: RawTransaction): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.sourceTransactionId.localeCompare(right.sourceTransactionId)
  );
}

function validTimestamp(value: string, errorCode: string): string {
  if (Number.isNaN(new Date(value).valueOf())) throw new Error(errorCode);
  return value;
}

function daysBefore(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function incrementalSince(cursor: string | null, now: string): string {
  const floor = daysBefore(now, INCREMENTAL_HISTORY_DAYS);
  if (cursor === null) return floor;
  const overlap = daysBefore(cursor, INCREMENTAL_CURSOR_OVERLAP_DAYS);
  return overlap < floor ? floor : overlap;
}
