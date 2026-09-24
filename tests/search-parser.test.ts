import { describe, expect, it } from 'vitest';

import { parseLedgerSearch } from '../src/domain/search-parser';
import type { Category } from '../src/domain/types';

const categories: readonly Category[] = [
  {
    id: 'category:coffee',
    name: 'Coffee',
    superCategory: 'FUN',
    defaultBudgetScope: 'INCLUDED',
  },
  {
    id: 'category:restaurants',
    name: 'Restaurants',
    superCategory: 'FUN',
    defaultBudgetScope: 'INCLUDED',
  },
  {
    id: 'category:subscriptions',
    name: 'Subscriptions',
    superCategory: 'LIVING',
    defaultBudgetScope: 'INCLUDED',
  },
];

const catalog = {
  categories,
  merchants: ['Tesco', 'Amazon Marketplace'],
};

describe('deterministic local search parser', () => {
  it('parses the documented compound query into visible meaning', () => {
    const parsed = parseLedgerSearch(
      'fun over £50 last 6 months',
      catalog,
      '2026-09-24',
    );

    expect(parsed.query).toEqual({
      date: {
        kind: 'RANGE',
        startDate: '2026-04-01',
        endDate: '2026-09-30',
      },
      superCategories: ['FUN'],
      amount: { comparator: 'GREATER_THAN', thresholdMinor: 5_000 },
    });
    expect(parsed.chips.map(({ label }) => label)).toEqual([
      'Amount > £50.00',
      'Last 6 months',
      'Fun',
    ]);
    expect(parsed.unrecognizedTokens).toEqual([]);
  });

  it.each([
    ['coffee this month', 'category:coffee'],
    ['restaurants august', 'category:restaurants'],
    ['subscriptions', 'category:subscriptions'],
  ])('parses category phrase %s', (input, categoryId) => {
    expect(
      parseLedgerSearch(input, catalog, '2026-09-24').query.categoryIds,
    ).toEqual([categoryId]);
  });

  it('parses merchant, year, weekday, weekend, and exact date filters', () => {
    expect(
      parseLedgerSearch('Tesco 2026', catalog, '2026-09-24').query,
    ).toMatchObject({
      merchant: 'Tesco',
      date: {
        kind: 'RANGE',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    });
    expect(
      parseLedgerSearch('saturday', catalog, '2026-09-24').query.weekdays,
    ).toEqual([6]);
    expect(
      parseLedgerSearch('weekends', catalog, '2026-09-24').query.weekdays,
    ).toEqual([0, 6]);
    expect(
      parseLedgerSearch('2026-09-03', catalog, '2026-09-24').query.date,
    ).toEqual({ kind: 'DAY', date: '2026-09-03' });
  });

  it('surfaces tokens it cannot prove instead of fabricating meaning', () => {
    const parsed = parseLedgerSearch(
      'coffee mysteriously quux',
      catalog,
      '2026-09-24',
    );

    expect(parsed.query.categoryIds).toEqual(['category:coffee']);
    expect(parsed.unrecognizedTokens).toEqual(['mysteriously', 'quux']);
  });

  it('rejects invalid date and unsafe range input', () => {
    expect(() =>
      parseLedgerSearch('2026-02-31', catalog, '2026-09-24'),
    ).toThrow('valid YYYY-MM-DD');
    expect(() =>
      parseLedgerSearch('last 121 months', catalog, '2026-09-24'),
    ).toThrow('between 1 and 120');
  });
});
