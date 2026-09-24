import { describe, expect, it } from 'vitest';

import {
  mapMonzoAccount,
  mapMonzoPot,
  mapMonzoTransaction,
} from '../src/integrations/monzo/adapter';
import {
  assertNativeAuthSupported,
  evaluateTokenLifecycle,
  MONZO_NATIVE_AUTH_CAPABILITY,
  redactSensitiveText,
  validateOAuthRedirect,
  validatePkceVerifier,
} from '../src/integrations/monzo/auth';

const SYNCED_AT = '2026-09-24T19:00:00.000Z';

describe('Monzo DTO adapter', () => {
  it('maps signed minor units and an allow-listed payload without domain coupling', () => {
    const raw = mapMonzoTransaction(
      'acc_synthetic',
      {
        id: 'tx_synthetic',
        account_id: 'acc_synthetic',
        amount: -1_299,
        currency: 'GBP',
        description: 'SYNTHETIC SHOP',
        created: '2026-09-23T10:00:00.000Z',
        settled: '',
        category: 'shopping',
        merchant: { id: 'merch_synthetic', name: 'Synthetic Shop' },
        is_load: false,
      },
      SYNCED_AT,
      'monzo_mock',
    );

    expect(raw).toMatchObject({
      source: 'monzo_mock',
      sourceTransactionId: 'tx_synthetic',
      sourceAccountId: 'acc_synthetic',
      amountMinor: -1_299,
      currency: 'GBP',
      merchantId: 'merch_synthetic',
      merchantName: 'Synthetic Shop',
      settledAt: null,
      sourceDeleted: false,
    });
    expect(JSON.parse(raw.rawPayloadJson)).toEqual({
      id: 'tx_synthetic',
      account_id: 'acc_synthetic',
      amount: -1_299,
      currency: 'GBP',
      description: 'SYNTHETIC SHOP',
      created: '2026-09-23T10:00:00.000Z',
      settled: null,
      category: 'shopping',
      merchant_id: 'merch_synthetic',
      merchant_name: 'Synthetic Shop',
      is_load: false,
      deleted: false,
    });
    expect(raw.rawPayloadJson).not.toContain('metadata');
    expect(raw.rawPayloadJson).not.toContain('notes');
  });

  it('preserves deleted transactions as tombstoned raw source records', () => {
    expect(
      mapMonzoTransaction(
        'acc_synthetic',
        {
          id: 'tx_deleted',
          amount: 500,
          currency: 'GBP',
          description: 'SYNTHETIC REVERSAL',
          created: '2026-09-20T10:00:00.000Z',
          deleted: true,
        },
        SYNCED_AT,
      ).sourceDeleted,
    ).toBe(true);
  });

  it('preserves the same money semantics as an equivalent fixture event', () => {
    const mapped = mapMonzoTransaction(
      'acc_synthetic',
      {
        id: 'tx_equivalent',
        amount: -420,
        currency: 'GBP',
        description: 'SYNTHETIC COFFEE',
        created: '2026-09-20T09:30:00.000Z',
      },
      SYNCED_AT,
      'monzo_mock',
    );
    const fixtureEquivalent = {
      amountMinor: -420,
      currency: 'GBP',
      description: 'SYNTHETIC COFFEE',
      sourceDeleted: false,
    };

    expect({
      amountMinor: mapped.amountMinor,
      currency: mapped.currency,
      description: mapped.description,
      sourceDeleted: mapped.sourceDeleted,
    }).toEqual(fixtureEquivalent);
    expect(mapped).not.toHaveProperty('eventType');
    expect(mapped).not.toHaveProperty('budgetScope');
  });

  it('maps account and pot source objects without assigning budget meaning', () => {
    expect(
      mapMonzoAccount({
        id: 'acc_synthetic',
        description: 'Synthetic account',
        created: '2026-01-01T00:00:00.000Z',
        type: 'uk_retail',
      }),
    ).toEqual({
      id: 'acc_synthetic',
      description: 'Synthetic account',
      createdAt: '2026-01-01T00:00:00.000Z',
      accountType: 'uk_retail',
      closed: false,
    });
    expect(
      mapMonzoPot('acc_synthetic', {
        id: 'pot_synthetic',
        name: 'Synthetic savings',
        balance: 20_000,
        currency: 'GBP',
        created: '2026-01-02T00:00:00.000Z',
        updated: '2026-09-01T00:00:00.000Z',
        deleted: false,
      }),
    ).not.toHaveProperty('eventType');
  });

  it('rejects malformed money, currency, timestamps, and account mismatches', () => {
    const valid = {
      id: 'tx_synthetic',
      amount: -100,
      currency: 'GBP',
      description: 'SYNTHETIC',
      created: '2026-09-20T10:00:00.000Z',
    } as const;
    expect(() =>
      mapMonzoTransaction(
        'acc_synthetic',
        { ...valid, amount: 1.5 },
        SYNCED_AT,
      ),
    ).toThrow();
    expect(() =>
      mapMonzoTransaction(
        'acc_synthetic',
        { ...valid, currency: 'gbp' },
        SYNCED_AT,
      ),
    ).toThrow('MONZO_INVALID_CURRENCY');
    expect(() =>
      mapMonzoTransaction(
        'acc_synthetic',
        { ...valid, account_id: 'acc_attacker' },
        SYNCED_AT,
      ),
    ).toThrow('MONZO_ACCOUNT_MISMATCH');
  });
});

describe('Monzo native authorization boundary', () => {
  it('fails closed because the documented native flow lacks PKCE and refresh', () => {
    expect(MONZO_NATIVE_AUTH_CAPABILITY).toMatchObject({
      liveEnabled: false,
      pkceDocumented: false,
      refreshAvailable: false,
    });
    expect(assertNativeAuthSupported).toThrow('native live auth fails closed');
  });

  it('validates PKCE verifier shape without enabling the unsupported flow', () => {
    expect(() => validatePkceVerifier('a'.repeat(43))).not.toThrow();
    expect(() => validatePkceVerifier('short')).toThrow('PKCE');
    expect(() => validatePkceVerifier(`${'a'.repeat(42)}!`)).toThrow('PKCE');
  });

  it('fails closed to reauthentication when a native token expires', () => {
    expect(
      evaluateTokenLifecycle(
        '2026-09-24T20:00:00.000Z',
        '2026-09-24T19:00:00.000Z',
      ),
    ).toEqual({ state: 'CONNECTED', canRefreshLocally: false });
    expect(
      evaluateTokenLifecycle(
        '2026-09-24T18:00:00.000Z',
        '2026-09-24T19:00:00.000Z',
      ),
    ).toEqual({ state: 'REAUTH_REQUIRED', canRefreshLocally: false });
  });

  it('accepts only the exact redirect and one matching state/code pair', () => {
    const expected = 'vibeledger://oauth/monzo';
    expect(
      validateOAuthRedirect(
        `${expected}?code=synthetic-code&state=unguessable-state`,
        expected,
        'unguessable-state',
      ),
    ).toEqual({ code: 'synthetic-code', state: 'unguessable-state' });

    for (const attack of [
      'vibeledger://oauth/other?code=x&state=unguessable-state',
      `${expected}?code=x&state=wrong`,
      `${expected}?code=x&code=y&state=unguessable-state`,
      `${expected}?code=x&state=unguessable-state#fragment`,
      `${expected}?error=denied&code=x&state=unguessable-state`,
    ]) {
      expect(() =>
        validateOAuthRedirect(attack, expected, 'unguessable-state'),
      ).toThrow();
    }
  });

  it('redacts tokens, secrets, and bearer authorization values', () => {
    const redacted = redactSensitiveText(
      'access_token=abc refresh-token:def client_secret=hunter2 Authorization:Bearer abc.def',
    );
    expect(redacted).not.toContain('abc');
    expect(redacted).not.toContain('def');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).toContain('[REDACTED]');
  });
});
