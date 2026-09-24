import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyFutureMerchantRule,
  createMerchantRule,
  listMerchantRules,
  saveTransactionCorrection,
  setMerchantRuleEnabled,
  undoLatestClassificationChange,
  updateMerchantRule,
} from '../src/data/classification-repository';
import {
  importDemoData,
  loadLedgerSnapshot,
} from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import { NodeDatabase } from './support/node-database';

describe('classification correction repository', () => {
  let database: NodeDatabase;

  beforeEach(async () => {
    database = new NodeDatabase();
    await migrateDatabase(database);
    await importDemoData(database);
  });

  afterEach(() => {
    database.close();
  });

  it('edits semantics without changing the immutable raw event and recalculates', async () => {
    const before = (await loadLedgerSnapshot(database, '2026-09')).ledgerMonth
      ?.summary.funActualMinor;

    await saveTransactionCorrection(database, {
      changeId: 'change:coffee:1',
      classificationId: 'manual:coffee:1',
      rawTransactionId: 'demo:coffee',
      eventType: 'SPEND',
      budgetScope: 'INCLUDED',
      categoryId: 'category:groceries',
      countsTowardBudgetBase: false,
      note: 'Breakfast meeting',
      splits: [],
      timestamp: '2026-09-24T13:00:00.000Z',
    });

    const snapshot = await loadLedgerSnapshot(database, '2026-09');
    expect(snapshot.ledgerMonth?.summary.funActualMinor).toBe(
      (before ?? 0) - 420,
    );
    expect(snapshot.ledgerMonth?.summary.livingActualMinor).toBe(104_920);
    expect(
      await database.getFirstAsync<{
        amount_minor: number;
        raw_payload_json: string;
      }>(
        `SELECT amount_minor, raw_payload_json
         FROM raw_transactions WHERE id = 'demo:coffee';`,
      ),
    ).toEqual({
      amount_minor: -420,
      raw_payload_json: JSON.stringify({
        synthetic: true,
        fixtureId: 'coffee',
      }),
    });
    expect(
      snapshot.ledgerMonth?.transactions.find(
        ({ raw }) => raw.id === 'demo:coffee',
      )?.classification,
    ).toMatchObject({
      categoryId: 'category:groceries',
      note: 'Breakfast meeting',
      classificationSource: 'MANUAL',
      updatedAt: '2026-09-24T13:00:00.000Z',
    });
  });

  it('requires exact integer split conservation and persists valid portions', async () => {
    await expect(
      saveTransactionCorrection(database, {
        changeId: 'change:coffee:invalid',
        classificationId: 'manual:coffee:invalid',
        rawTransactionId: 'demo:coffee',
        eventType: 'SPEND',
        budgetScope: 'INCLUDED',
        categoryId: null,
        countsTowardBudgetBase: false,
        note: null,
        splits: [
          split('split:coffee:1', 300, 'category:coffee'),
          split('split:coffee:2', 119, 'category:groceries'),
        ],
        timestamp: '2026-09-24T13:00:00.000Z',
      }),
    ).rejects.toThrow('total 419, expected 420');

    await saveTransactionCorrection(database, {
      changeId: 'change:coffee:valid',
      classificationId: 'manual:coffee:valid',
      rawTransactionId: 'demo:coffee',
      eventType: 'SPEND',
      budgetScope: 'INCLUDED',
      categoryId: null,
      countsTowardBudgetBase: false,
      note: null,
      splits: [
        split('split:coffee:1', 300, 'category:coffee'),
        split('split:coffee:2', 120, 'category:groceries'),
      ],
      timestamp: '2026-09-24T13:01:00.000Z',
    });

    expect(
      (await loadLedgerSnapshot(database, '2026-09')).ledgerMonth?.transactions
        .find(({ raw }) => raw.id === 'demo:coffee')
        ?.splits.map(({ amountMinorAbs }) => amountMinorAbs),
    ).toEqual([300, 120]);
  });

  it('undoes the latest change and retains durable audit history', async () => {
    await saveTransactionCorrection(database, {
      changeId: 'change:review:1',
      classificationId: 'manual:review:1',
      rawTransactionId: 'demo:needs-review',
      eventType: 'INTERNAL_TRANSFER',
      budgetScope: 'EXCLUDED',
      categoryId: null,
      countsTowardBudgetBase: false,
      note: 'Own account',
      splits: [],
      timestamp: '2026-09-24T13:00:00.000Z',
    });

    expect(
      await undoLatestClassificationChange(
        database,
        'demo:needs-review',
        '2026-09-24T13:01:00.000Z',
      ),
    ).toBe(true);
    expect(
      (
        await loadLedgerSnapshot(database, '2026-09')
      ).ledgerMonth?.transactions.find(
        ({ raw }) => raw.id === 'demo:needs-review',
      )?.classification,
    ).toMatchObject({
      eventType: 'NEUTRAL',
      confidence: 'LOW',
      classificationSource: 'DEFAULT',
    });
    expect(
      await database.getFirstAsync<{ count: number; undone_at: string }>(
        `SELECT count(*) AS count, max(undone_at) AS undone_at
         FROM classification_changes;`,
      ),
    ).toEqual({
      count: 1,
      undone_at: '2026-09-24T13:01:00.000Z',
    });
  });

  it('applies enabled merchant rules only to future records and protects manual overrides', async () => {
    await createMerchantRule(database, {
      id: 'rule:tesco',
      priority: 100,
      matchValue: 'Tesco',
      resultEventType: 'SPEND',
      resultCategoryId: 'category:groceries',
      resultBudgetScope: 'INCLUDED',
      timestamp: '2026-09-24T13:00:00.000Z',
    });
    expect(
      await applyFutureMerchantRule(
        database,
        'demo:tesco-split',
        'rule-result:historical',
        '2026-09-24T13:01:00.000Z',
      ),
    ).toBe('NO_MATCH');

    await insertFutureTransaction(database, 'future:tesco', 'Tesco');
    expect(
      await applyFutureMerchantRule(
        database,
        'future:tesco',
        'rule-result:future',
        '2026-10-01T12:01:00.000Z',
      ),
    ).toBe('APPLIED');

    await saveTransactionCorrection(database, {
      changeId: 'change:future:manual',
      classificationId: 'manual:future',
      rawTransactionId: 'future:tesco',
      eventType: 'NEUTRAL',
      budgetScope: 'EXCLUDED',
      categoryId: null,
      countsTowardBudgetBase: false,
      note: null,
      splits: [],
      timestamp: '2026-10-01T12:02:00.000Z',
    });
    expect(
      await applyFutureMerchantRule(
        database,
        'future:tesco',
        'rule-result:blocked',
        '2026-10-01T12:03:00.000Z',
      ),
    ).toBe('MANUAL_PROTECTED');

    await updateMerchantRule(database, 'rule:tesco', {
      priority: 200,
      matchValue: 'Tesco',
      resultEventType: 'SPEND',
      resultCategoryId: 'category:shopping',
      resultBudgetScope: 'EXCLUDED',
      timestamp: '2026-10-02T14:00:00.000Z',
    });
    await insertFutureTransaction(database, 'future:before-edit', 'Tesco');
    expect(
      await applyFutureMerchantRule(
        database,
        'future:before-edit',
        'rule-result:before-edit',
        '2026-10-02T14:00:01.000Z',
      ),
    ).toBe('NO_MATCH');
    await setMerchantRuleEnabled(
      database,
      'rule:tesco',
      false,
      '2026-10-02T14:01:00.000Z',
    );
    expect(await listMerchantRules(database)).toEqual([
      expect.objectContaining({
        id: 'rule:tesco',
        priority: 200,
        enabled: false,
        resultCategoryId: 'category:shopping',
      }),
    ]);
  });
});

function split(id: string, amountMinorAbs: number, categoryId: string) {
  return {
    id,
    amountMinorAbs,
    eventType: 'SPEND' as const,
    budgetScope: 'INCLUDED' as const,
    categoryId,
    note: null,
  };
}

async function insertFutureTransaction(
  database: NodeDatabase,
  id: string,
  merchantName: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO raw_transactions (
      id, source, source_transaction_id, amount_minor, currency, description,
      merchant_name, created_at, raw_payload_json, first_seen_at, last_synced_at
    ) VALUES (?, 'test', ?, -1000, 'GBP', ?, ?, ?, '{}', ?, ?);`,
    id,
    id,
    merchantName,
    merchantName,
    '2026-10-01T12:00:00.000Z',
    '2026-10-01T12:00:00.000Z',
    '2026-10-01T12:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO transaction_classifications (
      id, raw_transaction_id, event_type, budget_scope, category_id,
      classification_source, confidence, counts_toward_budget_base,
      active, created_at, updated_at
    ) VALUES (?, ?, 'SPEND', 'INCLUDED', 'category:coffee',
      'IMPORT_HINT', 'HIGH', 0, 1, ?, ?);`,
    `${id}:classification`,
    id,
    '2026-10-01T12:00:00.000Z',
    '2026-10-01T12:00:00.000Z',
  );
}
