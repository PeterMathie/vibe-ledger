import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveClassification,
  validateSplits,
} from '../src/domain/classification';
import type {
  Classification,
  RawTransaction,
  TransactionSplit,
} from '../src/domain/types';

const raw = rawTransaction('raw', -7_000);

describe('classification foundations', () => {
  it('resolves the documented precedence and keeps manual decisions highest', () => {
    const defaultCandidate = classification('default', 'DEFAULT', 'SPEND');
    const ruleCandidate = classification('rule', 'RULE', 'INTERNAL_TRANSFER');
    const manualCandidate = classification('manual', 'MANUAL', 'SPEND');

    expect(
      resolveEffectiveClassification([
        manualCandidate,
        defaultCandidate,
        ruleCandidate,
      ]),
    ).toBe(manualCandidate);
  });

  it('uses the latest update only within the same precedence', () => {
    const older = classification(
      'older',
      'RULE',
      'SPEND',
      '2026-09-01T00:00:00.000Z',
    );
    const newer = classification(
      'newer',
      'RULE',
      'INTERNAL_TRANSFER',
      '2026-09-02T00:00:00.000Z',
    );

    expect(resolveEffectiveClassification([older, newer])).toBe(newer);
  });

  it('enforces exact split conservation', () => {
    const valid = [split('groceries', 5_500), split('fun', 1_500)];
    expect(() => validateSplits(raw, valid)).not.toThrow();
    expect(() =>
      validateSplits(raw, [split('groceries', 5_500), split('fun', 1_499)]),
    ).toThrow('expected 7000');
  });
});

function classification(
  id: string,
  classificationSource: Classification['classificationSource'],
  eventType: Classification['eventType'],
  updatedAt = '2026-09-01T00:00:00.000Z',
): Classification {
  return {
    id,
    rawTransactionId: raw.id,
    eventType,
    budgetScope: 'INCLUDED',
    categoryId: null,
    classificationSource,
    confidence: classificationSource === 'MANUAL' ? 'MANUAL' : 'HIGH',
    countsTowardBudgetBase: false,
    offsetRawTransactionId: null,
    note: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function split(id: string, amountMinorAbs: number): TransactionSplit {
  return {
    id,
    rawTransactionId: raw.id,
    amountMinorAbs,
    eventType: 'SPEND',
    budgetScope: 'INCLUDED',
    categoryId: id,
    classificationSource: 'MANUAL',
    note: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function rawTransaction(id: string, amountMinor: number): RawTransaction {
  return {
    id,
    source: 'fixture',
    sourceTransactionId: id,
    sourceAccountId: null,
    amountMinor,
    currency: 'GBP',
    description: id,
    merchantId: null,
    merchantName: null,
    sourceCategory: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    settledAt: null,
    rawPayloadJson: '{}',
    firstSeenAt: '2026-09-01T00:00:00.000Z',
    lastSyncedAt: '2026-09-01T00:00:00.000Z',
    sourceDeleted: false,
  };
}
