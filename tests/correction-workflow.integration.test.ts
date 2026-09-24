import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createExplorerViewModel } from '../src/app/view-models';
import {
  saveTransactionCorrection,
  undoLatestClassificationChange,
} from '../src/data/classification-repository';
import {
  importDemoData,
  loadLedgerSnapshot,
  queryLedgerTransactions,
  resetDemoData,
} from '../src/data/demo-repository';
import { migrateDatabase } from '../src/data/migrations';
import { monthQuery } from '../src/domain/query';
import { NodeDatabase } from './support/node-database';

describe('persisted Explorer correction journey', () => {
  let directory: string;
  let path: string;
  let database: NodeDatabase;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'vibe-ledger-correction-'));
    path = join(directory, 'ledger.sqlite');
    database = new NodeDatabase(path);
    await migrateDatabase(database);
    await importDemoData(database);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true });
  });

  it('preserves edit, exact drill-down, restart, and undo semantics', async () => {
    const drillDown = monthQuery('2026-09', {
      superCategories: ['LIVING'],
      scopes: ['INCLUDED'],
    });
    await saveTransactionCorrection(database, {
      changeId: 'journey:change:1',
      classificationId: 'journey:manual:1',
      rawTransactionId: 'demo:coffee',
      eventType: 'SPEND',
      budgetScope: 'INCLUDED',
      categoryId: 'category:groceries',
      countsTowardBudgetBase: false,
      note: 'Persistent correction',
      splits: [],
      timestamp: '2026-09-24T17:00:00.000Z',
    });

    const queryBeforeRestart = await queryLedgerTransactions(
      database,
      drillDown,
      'GBP',
    );
    expect(queryBeforeRestart.matches.map(({ raw }) => raw.id)).toContain(
      'demo:coffee',
    );
    const viewBeforeRestart = createExplorerViewModel(
      queryBeforeRestart.matches,
      queryBeforeRestart.resolutionTransactions,
      drillDown,
      'GBP',
    );
    expect(viewBeforeRestart.includedSpendLabel).toBe('£1,049.20');
    expect(
      viewBeforeRestart.breakdown.find(
        ({ key }) => key === 'category:groceries',
      ),
    ).toMatchObject({
      amountLabel: '£59.20',
      transactionCountLabel: '2 transactions',
    });

    database.close();
    database = new NodeDatabase(path);
    await migrateDatabase(database);

    const queryAfterRestart = await queryLedgerTransactions(
      database,
      drillDown,
      'GBP',
    );
    expect(queryAfterRestart.matches.map(({ raw }) => raw.id)).toEqual(
      queryBeforeRestart.matches.map(({ raw }) => raw.id),
    );
    expect(
      (
        await loadLedgerSnapshot(database, '2026-09')
      ).ledgerMonth?.transactions.find(({ raw }) => raw.id === 'demo:coffee')
        ?.classification.note,
    ).toBe('Persistent correction');

    expect(
      await undoLatestClassificationChange(
        database,
        'demo:coffee',
        '2026-09-24T17:01:00.000Z',
      ),
    ).toBe(true);
    const afterUndo = await queryLedgerTransactions(database, drillDown, 'GBP');
    expect(afterUndo.matches.map(({ raw }) => raw.id)).not.toContain(
      'demo:coffee',
    );
  });

  it('resets corrected demo records without touching unrelated rows', async () => {
    await saveTransactionCorrection(database, {
      changeId: 'journey:change:reset',
      classificationId: 'journey:manual:reset',
      rawTransactionId: 'demo:coffee',
      eventType: 'NEUTRAL',
      budgetScope: 'EXCLUDED',
      categoryId: null,
      countsTowardBudgetBase: false,
      note: null,
      splits: [],
      timestamp: '2026-09-24T17:00:00.000Z',
    });

    await expect(resetDemoData(database)).resolves.toBeUndefined();
    expect(
      await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) AS count FROM classification_changes;',
      ),
    ).toEqual({ count: 0 });
  });
});
