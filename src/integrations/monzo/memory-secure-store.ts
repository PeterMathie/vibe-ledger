import { MonzoAuthError } from './auth';
import {
  validateMonzoToken,
  type MonzoToken,
  type SecureTokenStore,
} from './secure-store-types';

export class MemorySecureTokenStore implements SecureTokenStore {
  private token: MonzoToken | null = null;
  failOperations = false;

  async read(): Promise<MonzoToken | null> {
    this.assertWorking();
    return this.token === null ? null : { ...this.token };
  }

  async write(token: MonzoToken): Promise<void> {
    this.assertWorking();
    validateMonzoToken(token);
    this.token = { ...token };
  }

  async delete(): Promise<void> {
    this.assertWorking();
    this.token = null;
  }

  private assertWorking(): void {
    if (this.failOperations) {
      throw new MonzoAuthError(
        'SECURE_STORE_UNAVAILABLE',
        'Secure token storage is unavailable.',
      );
    }
  }
}
