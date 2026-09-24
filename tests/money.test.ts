import { describe, expect, it } from 'vitest';

import {
  absoluteMoney,
  addMoney,
  allocateByBasisPoints,
  formatMoney,
  money,
  subtractMoney,
} from '../src/domain/money';

describe('BL-001 money primitive', () => {
  it('adds and subtracts integer minor units in one currency', () => {
    expect(addMoney(money(1_000, 'gbp'), money(234, 'GBP'))).toEqual({
      amountMinor: 1_234,
      currency: 'GBP',
    });
    expect(subtractMoney(money(1_000, 'GBP'), money(234, 'GBP'))).toEqual({
      amountMinor: 766,
      currency: 'GBP',
    });
    expect(absoluteMoney(money(-420, 'GBP')).amountMinor).toBe(420);
  });

  it('rejects fractional minor units and mixed currencies', () => {
    expect(() => money(4.2, 'GBP')).toThrow('safe integer');
    expect(() => addMoney(money(100, 'GBP'), money(100, 'USD'))).toThrow(
      'Cannot combine GBP and USD',
    );
  });

  it('formats GBP and USD using locale-aware currency formatting', () => {
    expect(formatMoney(money(1_234, 'GBP'), 'en-GB')).toBe('£12.34');
    expect(formatMoney(money(1_234, 'USD'), 'en-US')).toBe('$12.34');
    expect(formatMoney(money(-123_456, 'GBP'), 'en-GB')).toBe('-£1,234.56');
  });

  it('allocates basis points deterministically without losing pennies', () => {
    const allocation = allocateByBasisPoints(money(101, 'GBP'), {
      LIVING: 5_000,
      SAVING: 3_000,
      FUN: 2_000,
    });

    expect(allocation).toEqual({
      LIVING: money(51, 'GBP'),
      SAVING: money(30, 'GBP'),
      FUN: money(20, 'GBP'),
    });
  });
});
