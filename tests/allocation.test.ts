import { describe, expect, it } from 'vitest';

import {
  createRunoverModel,
  DEFAULT_ALLOCATION,
  parseAllocationPercentages,
  ratiosFromBoundaries,
  runoverRow,
} from '../src/app/allocation';
import { createMonthlyBudget } from '../src/domain/budget';

describe('interactive allocation', () => {
  it('keeps dragged boundaries in range and totals exactly 100%', () => {
    for (const [livingEnd, savingEnd] of [
      [-200, 11_000],
      [4_321, 7_654],
      [9_000, 2_000],
    ] as const) {
      const ratios = ratiosFromBoundaries(livingEnd, savingEnd);
      expect(ratios.LIVING + ratios.SAVING + ratios.FUN).toBe(10_000);
      expect(Object.values(ratios).every((value) => value >= 0)).toBe(true);
    }
  });

  it('parses exact accessible percentages without floating-point money', () => {
    expect(parseAllocationPercentages('49.99', '30.01', '20')).toEqual({
      LIVING: 4_999,
      SAVING: 3_001,
      FUN: 2_000,
    });
    expect(() => parseAllocationPercentages('49.99', '30', '20')).toThrow(
      'total exactly 100%',
    );
    expect(() => parseAllocationPercentages('50.001', '30', '20')).toThrow(
      'up to two decimal places',
    );
  });

  it('recalculates exact targets and supports the default reset', () => {
    const budget = createMonthlyBudget(
      '2026-09',
      'GBP',
      300_001,
      parseAllocationPercentages('40', '35', '25'),
      '2026-09-01T00:00:00.000Z',
    );
    expect([
      budget.livingTargetMinor,
      budget.savingTargetMinor,
      budget.funTargetMinor,
    ]).toEqual([120_001, 105_000, 75_000]);
    expect(
      budget.livingTargetMinor +
        budget.savingTargetMinor +
        budget.funTargetMinor,
    ).toBe(300_001);
    expect(DEFAULT_ALLOCATION).toEqual({
      LIVING: 5_000,
      SAVING: 3_000,
      FUN: 2_000,
    });
  });
});

describe('wrapping runover model', () => {
  it.each([
    [0, 0, 0, 0],
    [50, 100, 1, 5_000],
    [100, 100, 1, 0],
    [114, 100, 2, 1_400],
    [238, 100, 3, 3_800],
    [300, 100, 3, 0],
  ])(
    'models actual %i and target %i as %i rows',
    (actual, target, rowCount, partial) => {
      const model = createRunoverModel(actual, target);
      expect(model.rowCount).toBe(rowCount);
      expect(model.partialRowBasisPoints).toBe(partial);
      if (rowCount > 0) {
        expect(runoverRow(model, 0).tone).toBe('IDENTITY');
      }
      if (rowCount > 1) {
        expect(runoverRow(model, 1).tone).toBe('BREACH');
      }
    },
  );

  it('keeps extreme overspend proportional while flagging virtualization', () => {
    const model = createRunoverModel(10_000_000, 60_000);
    expect(model.rowCount).toBe(167);
    expect(model.fullRowCount).toBe(166);
    expect(model.partialRowBasisPoints).toBe(6_666);
    expect(model.virtualized).toBe(true);
    expect(runoverRow(model, 166)).toMatchObject({
      fillBasisPoints: 6_666,
      tone: 'BREACH',
    });
  });

  it('does not divide when no target is set', () => {
    expect(createRunoverModel(5_000, 0)).toMatchObject({
      rowCount: 0,
      accessibilityRowSummary: 'No target set.',
    });
  });
});
