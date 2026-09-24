import { describe, expect, it } from 'vitest';

import boundaryFixtures from '../fixtures/boundary-fixtures.json';

describe('synthetic boundary fixture catalog', () => {
  it('uses deterministic unique identifiers and no credential-like fields', () => {
    const ids = boundaryFixtures.events.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(boundaryFixtures)).not.toMatch(
      /access_token|refresh_token|client_secret|account_number|sort_code/i,
    );
  });

  it('preserves plausible bank signs and exact split conservation', () => {
    for (const event of boundaryFixtures.events) {
      if ('splits' in event) {
        const splitTotal = event.splits.reduce(
          (sum, split) => sum + split.amount_minor_abs,
          0,
        );
        expect(splitTotal).toBe(Math.abs(event.amount_minor));
      }
      if (
        ['SPEND', 'SAVING_CONTRIBUTION', 'DEBT_PAYMENT'].includes(
          event.expected_type,
        )
      ) {
        expect(event.amount_minor).toBeLessThanOrEqual(0);
      }
      if (
        ['REFUND', 'REIMBURSEMENT', 'SAVING_WITHDRAWAL'].includes(
          event.expected_type,
        )
      ) {
        expect(event.amount_minor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('retains exact subscription ratios alongside rounded display values', () => {
    const twoYear = boundaryFixtures.subscriptions.find(
      ({ id }) => id === 'two_year_usd',
    );
    expect(twoYear).toMatchObject({
      billing_amount_minor: 20_000,
      billing_currency: 'USD',
      interval_months: 24,
      exact_monthly_equivalent: {
        numerator_minor: 20_000,
        denominator_months: 24,
      },
      display_monthly_minor: 833,
    });
  });
});
