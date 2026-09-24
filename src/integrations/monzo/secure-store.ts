import * as SecureStore from 'expo-secure-store';

import { MonzoAuthError } from './auth';
import {
  validateMonzoToken,
  type MonzoToken,
  type SecureTokenStore,
} from './secure-store-types';

const TOKEN_KEY = 'vibe-ledger.monzo.oauth-token.v1';

export type { MonzoToken, SecureTokenStore } from './secure-store-types';

export class ExpoSecureTokenStore implements SecureTokenStore {
  async read(): Promise<MonzoToken | null> {
    await assertAvailable();
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    return stored === null ? null : parseToken(stored);
  }

  async write(token: MonzoToken): Promise<void> {
    await assertAvailable();
    validateMonzoToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(token), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async delete(): Promise<void> {
    await assertAvailable();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function assertAvailable(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new MonzoAuthError(
      'SECURE_STORE_UNAVAILABLE',
      'Secure token storage is unavailable.',
    );
  }
}

function parseToken(value: string): MonzoToken {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new MonzoAuthError(
      'SECURE_STORE_UNAVAILABLE',
      'Stored token data is invalid.',
    );
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new MonzoAuthError(
      'SECURE_STORE_UNAVAILABLE',
      'Stored token data is invalid.',
    );
  }
  const candidate = parsed as Partial<MonzoToken>;
  const token: MonzoToken = {
    accessToken: candidate.accessToken ?? '',
    refreshToken: candidate.refreshToken ?? null,
    expiresAt: candidate.expiresAt ?? '',
  };
  try {
    validateMonzoToken(token);
  } catch {
    throw new MonzoAuthError(
      'SECURE_STORE_UNAVAILABLE',
      'Stored token data is invalid.',
    );
  }
  return token;
}
