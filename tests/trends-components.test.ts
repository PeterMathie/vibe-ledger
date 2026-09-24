import { describe, expect, it } from 'vitest';

import { createTrendChartLayout, periodRequest } from '../src/app/trends';
import type { TrendModel } from '../src/domain/trends';

describe('Trends component models', () => {
  it('creates exact 3/6/12/24 month period boundaries across years', () => {
    expect(periodRequest('2026-01', 3, { kind: 'OVERALL' })).toMatchObject({
      startMonth: '2025-11',
      endMonth: '2026-01',
    });
    expect(periodRequest('2026-09', 24, { kind: 'OVERALL' })).toMatchObject({
      startMonth: '2024-10',
      endMonth: '2026-09',
    });
  });

  it('lays out grouped, negative, zero-target, and extreme bars on one scale', () => {
    const model: TrendModel = {
      currency: 'GBP',
      selection: {
        kind: 'SUPER_CATEGORIES',
        superCategories: ['LIVING', 'FUN'],
      },
      otherCurrencies: [],
      months: [
        {
          month: '2026-09',
          netSavingsMovementMinor: 0,
          drillDown: { date: { kind: 'MONTH', month: '2026-09' } },
          bars: [
            bar('living', 'LIVING', 100, 0, [
              segment('rent', 100, 'category:rent'),
            ]),
            bar('fun', 'FUN', -50, 1_000_000, [
              segment('coffee', -50, 'category:coffee'),
            ]),
          ],
        },
      ],
    };

    const layout = createTrendChartLayout(model, 200, 80);
    expect(layout.scaleMinor).toBe(1_000_000);
    expect(layout.bars.get('living')).toMatchObject({
      positiveHeight: 0.02,
      negativeHeight: 0,
      targetHeight: 0,
    });
    expect(layout.bars.get('fun')).toMatchObject({
      positiveHeight: 0,
      negativeHeight: 0.004,
      targetHeight: 200,
      segments: [
        {
          id: 'coffee',
          direction: 'NEGATIVE',
          amountMinor: -50,
        },
      ],
    });
  });
});

function bar(
  id: string,
  superCategory: 'LIVING' | 'FUN',
  actualMinor: number,
  targetMinor: number,
  segments: TrendModel['months'][number]['bars'][number]['segments'],
): TrendModel['months'][number]['bars'][number] {
  return {
    id,
    month: '2026-09',
    label: superCategory === 'LIVING' ? 'Living' : 'Fun',
    superCategory,
    measure: 'INCLUDED_SPENDING',
    actualMinor,
    targetMinor,
    transactionCount: 1,
    segments,
    drillDown: {
      date: { kind: 'MONTH', month: '2026-09' },
      superCategories: [superCategory],
      scopes: ['INCLUDED'],
    },
  };
}

function segment(
  id: string,
  amountMinor: number,
  categoryId: string,
): TrendModel['months'][number]['bars'][number]['segments'][number] {
  return {
    id,
    label: id,
    amountMinor,
    transactionCount: 1,
    drillDown: {
      date: { kind: 'MONTH', month: '2026-09' },
      categoryIds: [categoryId],
      scopes: ['INCLUDED'],
    },
  };
}
