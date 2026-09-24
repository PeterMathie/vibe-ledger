export interface MonzoToken {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string;
}

export interface SecureTokenStore {
  read(): Promise<MonzoToken | null>;
  write(token: MonzoToken): Promise<void>;
  delete(): Promise<void>;
}

export function validateMonzoToken(token: MonzoToken): void {
  if (
    token.accessToken.trim() === '' ||
    (token.refreshToken !== null && token.refreshToken.trim() === '') ||
    Number.isNaN(new Date(token.expiresAt).valueOf())
  ) {
    throw new Error('MONZO_INVALID_TOKEN');
  }
}
