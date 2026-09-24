import { money } from '../../domain/money';
import type { RawTransaction } from '../../domain/types';
import type {
  MonzoAccountDto,
  MonzoMerchantDto,
  MonzoPotDto,
  MonzoTransactionDto,
} from './dto';

export type MonzoRawSource = 'monzo' | 'monzo_mock';

export interface MonzoSourceAccount {
  readonly id: string;
  readonly description: string;
  readonly createdAt: string;
  readonly accountType: string | null;
  readonly closed: boolean;
}

export interface MonzoSourcePot {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly balanceMinor: number;
  readonly currency: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deleted: boolean;
}

export function mapMonzoAccount(dto: MonzoAccountDto): MonzoSourceAccount {
  return {
    id: requiredText(dto.id, 'account.id'),
    description: requiredText(dto.description, 'account.description'),
    createdAt: timestamp(dto.created, 'account.created'),
    accountType: optionalText(dto.type, 'account.type'),
    closed: dto.closed ?? false,
  };
}

export function mapMonzoPot(
  accountId: string,
  dto: MonzoPotDto,
): MonzoSourcePot {
  const currency = currencyCode(dto.currency);
  money(dto.balance, currency);
  return {
    id: requiredText(dto.id, 'pot.id'),
    accountId: requiredText(accountId, 'pot.accountId'),
    name: requiredText(dto.name, 'pot.name'),
    balanceMinor: dto.balance,
    currency,
    createdAt: timestamp(dto.created, 'pot.created'),
    updatedAt: timestamp(dto.updated, 'pot.updated'),
    deleted: boolean(dto.deleted, 'pot.deleted'),
  };
}

export function mapMonzoTransaction(
  accountId: string,
  dto: MonzoTransactionDto,
  syncedAt: string,
  source: MonzoRawSource = 'monzo',
): RawTransaction {
  const validatedAccountId = requiredText(accountId, 'transaction.accountId');
  if (dto.account_id !== undefined && dto.account_id !== validatedAccountId) {
    throw new Error('MONZO_ACCOUNT_MISMATCH');
  }
  const sourceTransactionId = requiredText(dto.id, 'transaction.id');
  const currency = currencyCode(dto.currency);
  money(dto.amount, currency);
  const merchant = mapMerchant(dto.merchant);
  const createdAt = timestamp(dto.created, 'transaction.created');
  const settledAt =
    dto.settled === undefined || dto.settled === ''
      ? null
      : timestamp(dto.settled, 'transaction.settled');
  const normalizedSyncedAt = timestamp(syncedAt, 'transaction.syncedAt');
  const sourceDeleted = dto.deleted ?? false;
  if (typeof sourceDeleted !== 'boolean') {
    throw new Error('MONZO_INVALID_TRANSACTION_DELETED');
  }

  const safePayload = {
    id: sourceTransactionId,
    account_id: validatedAccountId,
    amount: dto.amount,
    currency,
    description: requiredText(dto.description, 'transaction.description'),
    created: createdAt,
    settled: settledAt,
    category: optionalText(dto.category, 'transaction.category'),
    merchant_id: merchant.id,
    merchant_name: merchant.name,
    is_load: dto.is_load ?? false,
    deleted: sourceDeleted,
  };

  return {
    id: `${source}:${sourceTransactionId}`,
    source,
    sourceTransactionId,
    sourceAccountId: validatedAccountId,
    amountMinor: dto.amount,
    currency,
    description: safePayload.description,
    merchantId: merchant.id,
    merchantName: merchant.name,
    sourceCategory: safePayload.category,
    createdAt,
    settledAt,
    rawPayloadJson: JSON.stringify(safePayload),
    firstSeenAt: normalizedSyncedAt,
    lastSyncedAt: normalizedSyncedAt,
    sourceDeleted,
  };
}

function mapMerchant(value: MonzoTransactionDto['merchant']): {
  readonly id: string | null;
  readonly name: string | null;
} {
  if (value === undefined || value === null) {
    return { id: null, name: null };
  }
  if (typeof value === 'string') {
    return { id: requiredText(value, 'transaction.merchant'), name: null };
  }
  const merchant = value as MonzoMerchantDto;
  return {
    id: requiredText(merchant.id, 'transaction.merchant.id'),
    name: requiredText(merchant.name, 'transaction.merchant.name'),
  };
}

function currencyCode(value: string): string {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error('MONZO_INVALID_CURRENCY');
  }
  return value;
}

function timestamp(value: string, path: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    Number.isNaN(new Date(value).valueOf())
  ) {
    throw new Error(`MONZO_INVALID_${path.toUpperCase().replaceAll('.', '_')}`);
  }
  return value;
}

function requiredText(value: string, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`MONZO_INVALID_${path.toUpperCase().replaceAll('.', '_')}`);
  }
  return value;
}

function optionalText(value: string | undefined, path: string): string | null {
  return value === undefined ? null : requiredText(value, path);
}

function boolean(value: boolean, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`MONZO_INVALID_${path.toUpperCase().replaceAll('.', '_')}`);
  }
  return value;
}
