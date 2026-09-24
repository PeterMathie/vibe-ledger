import { describe, expect, it } from 'vitest';

import { EVENT_TYPES, parseEnumValue } from '../src/domain/enums';

describe('BL-002 persisted enums', () => {
  it('round-trips canonical event types', () => {
    for (const eventType of EVENT_TYPES) {
      expect(parseEnumValue(EVENT_TYPES, eventType, 'event type')).toBe(
        eventType,
      );
    }
  });

  it('fails safely for unknown future values', () => {
    expect(() =>
      parseEnumValue(EVENT_TYPES, 'FUTURE_TYPE', 'event type'),
    ).toThrow('Unknown event type: FUTURE_TYPE');
  });
});
