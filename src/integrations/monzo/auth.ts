export const MONZO_NATIVE_AUTH_CAPABILITY = {
  liveEnabled: false,
  pkceDocumented: false,
  refreshAvailable: false,
  reason:
    'Monzo does not document PKCE and requires a client secret for token exchange; native live auth fails closed.',
} as const;

export type MonzoAuthState =
  | 'DEMO_NOT_CONNECTED'
  | 'AUTHORIZING'
  | 'AWAITING_MONZO_APPROVAL'
  | 'CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'ERROR';

export interface OAuthRedirect {
  readonly code: string;
  readonly state: string;
}

export interface TokenLifecycle {
  readonly state: 'CONNECTED' | 'REAUTH_REQUIRED';
  readonly canRefreshLocally: false;
}

export function assertNativeAuthSupported(): never {
  throw new MonzoAuthError(
    'UNSUPPORTED_NATIVE_AUTH',
    MONZO_NATIVE_AUTH_CAPABILITY.reason,
  );
}

export function validateOAuthRedirect(
  redirect: string,
  expectedRedirect: string,
  expectedState: string,
): OAuthRedirect {
  const actual = new URL(redirect);
  const expected = new URL(expectedRedirect);
  if (
    actual.protocol !== expected.protocol ||
    actual.host !== expected.host ||
    actual.pathname !== expected.pathname ||
    actual.username !== '' ||
    actual.password !== '' ||
    actual.hash !== ''
  ) {
    throw new MonzoAuthError('INVALID_REDIRECT', 'OAuth redirect rejected.');
  }
  const states = actual.searchParams.getAll('state');
  const codes = actual.searchParams.getAll('code');
  if (
    states.length !== 1 ||
    codes.length !== 1 ||
    !constantTimeEqual(states[0] ?? '', expectedState) ||
    (codes[0] ?? '').trim() === ''
  ) {
    throw new MonzoAuthError('INVALID_REDIRECT', 'OAuth redirect rejected.');
  }
  if (actual.searchParams.has('error')) {
    throw new MonzoAuthError('AUTH_DENIED', 'Monzo authorization was denied.');
  }
  return { code: codes[0]!, state: states[0]! };
}

export function validatePkceVerifier(verifier: string): void {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new MonzoAuthError('INVALID_PKCE', 'PKCE verifier rejected.');
  }
}

export function evaluateTokenLifecycle(
  expiresAt: string,
  now: string,
): TokenLifecycle {
  const expiry = new Date(expiresAt).valueOf();
  const current = new Date(now).valueOf();
  if (Number.isNaN(expiry) || Number.isNaN(current)) {
    throw new MonzoAuthError('REAUTH_REQUIRED', 'Token expiry is invalid.');
  }
  return {
    state: expiry > current ? 'CONNECTED' : 'REAUTH_REQUIRED',
    canRefreshLocally: false,
  };
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:access|refresh)[_-]?token|authorization|client[_-]?secret)\s*[:=]\s*[^\s,;&]+/gi,
      '$1=[REDACTED]',
    );
}

export class MonzoAuthError extends Error {
  constructor(
    readonly code:
      | 'UNSUPPORTED_NATIVE_AUTH'
      | 'INVALID_REDIRECT'
      | 'AUTH_DENIED'
      | 'INVALID_PKCE'
      | 'SECURE_STORE_UNAVAILABLE'
      | 'REAUTH_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'MonzoAuthError';
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
