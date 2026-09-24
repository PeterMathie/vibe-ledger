import { describe, expect, it } from 'vitest';

import {
  asyncStateLabel,
  heatMapDayLabel,
  MINIMUM_TOUCH_TARGET,
  visibleHeatMapCue,
} from '../src/app/accessibility';

describe('accessibility helpers', () => {
  it('keeps interactive targets at least 48 density-independent pixels', () => {
    expect(MINIMUM_TOUCH_TARGET).toBe(48);
  });

  it('describes loading, empty and error states without exposing internals', () => {
    expect(asyncStateLabel('local subscriptions', 'LOADING')).toBe(
      'Loading local subscriptions',
    );
    expect(asyncStateLabel('transactions', 'EMPTY')).toBe(
      'No transactions available',
    );
    expect(asyncStateLabel('Trends', 'ERROR')).toBe('Trends unavailable');
  });

  it('gives heat-map cells an amount, status and action', () => {
    expect(
      heatMapDayLabel('Thu, 24 Sep', '£12.00', 'ABOVE_DAILY_REFERENCE'),
    ).toBe(
      'Thu, 24 Sep. £12.00 included spending. ABOVE_DAILY_REFERENCE. Open exact-date Breakdown.',
    );
  });

  it('provides a visible non-colour cue for every heat-map tone', () => {
    expect(visibleHeatMapCue('NEUTRAL')).toBe('–');
    expect(visibleHeatMapCue('GREEN')).toBe('•');
    expect(visibleHeatMapCue('RED')).toBe('!');
  });
});
