import { describe, expect, it } from 'vitest';

import { createMonthlyHeatMap } from '../src/app/heat-map';
import { dayQuery } from '../src/domain/query';

describe('monthly spending heat map', () => {
  it.each([
    ['2025-02', 28],
    ['2024-02', 29],
    ['2026-04', 30],
    ['2026-05', 31],
  ])('builds every calendar day for %s', (month, days) => {
    expect(createMonthlyHeatMap(month, 70_000, 30_000, {})).toMatchObject({
      month,
      daysInMonth: days,
      days: expect.arrayContaining([
        expect.objectContaining({ day: 1 }),
        expect.objectContaining({ day: days }),
      ]),
    });
  });

  it('uses Living plus Fun divided by calendar days as the reference', () => {
    const heatMap = createMonthlyHeatMap('2026-04', 60_000, 30_000, {
      '2026-04-01': 2_999,
      '2026-04-02': 3_000,
      '2026-04-03': 3_001,
    });
    expect(heatMap.dailyReferenceNumeratorMinor).toBe(90_000);
    expect(heatMap.dailyReferenceDenominator).toBe(30);
    expect(heatMap.days.slice(0, 3)).toMatchObject([
      { tone: 'GREEN', status: 'Below daily reference' },
      {
        tone: 'GREEN',
        intensityBasisPoints: 10_000,
        status: 'At daily reference',
      },
      { tone: 'RED', status: 'Above daily reference' },
    ]);
  });

  it('caps red at monthly spendable budget and keeps zero neutral', () => {
    const heatMap = createMonthlyHeatMap('2026-09', 60_000, 30_000, {
      '2026-09-01': 0,
      '2026-09-02': 89_999,
      '2026-09-03': 90_000,
      '2026-09-04': 9_000_000,
      '2026-09-05': -500,
    });
    expect(heatMap.days.slice(0, 5)).toMatchObject([
      { tone: 'NEUTRAL', intensityBasisPoints: 0 },
      { tone: 'RED', intensityBasisPoints: 9_999 },
      { tone: 'RED', intensityBasisPoints: 10_000 },
      { tone: 'RED', intensityBasisPoints: 10_000 },
      {
        tone: 'NEUTRAL',
        status: 'Net refund or reimbursement',
      },
    ]);
  });

  it('produces the exact day drill-down payload', () => {
    expect(dayQuery('2026-09-03')).toEqual({
      date: { kind: 'DAY', date: '2026-09-03' },
    });
  });
});
