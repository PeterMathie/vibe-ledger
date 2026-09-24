export const MONZO_NETWORK_POLICY = {
  apiOrigin: 'https://api.monzo.com',
  authOrigin: 'https://auth.monzo.com',
  tlsMinimum: 'TLS 1.2',
  requestTimeoutMs: 15_000,
  maximumAttempts: 3,
  baseBackoffMs: 500,
  backgroundSync: false,
} as const;

export class MonzoTransportError extends Error {
  constructor(
    readonly code: 'OFFLINE' | 'TIMEOUT' | 'RATE_LIMITED' | 'HTTP_ERROR',
    readonly retryAfterMs: number | null = null,
  ) {
    super(code);
    this.name = 'MonzoTransportError';
  }
}

export interface RetryOptions {
  readonly signal?: AbortSignal;
  readonly sleep?: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
}

export async function withMonzoRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? abortableSleep;
  for (
    let attempt = 1;
    attempt <= MONZO_NETWORK_POLICY.maximumAttempts;
    attempt += 1
  ) {
    throwIfAborted(options.signal);
    const timeout = new AbortController();
    const abort = () => timeout.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => timeout.abort(new MonzoTransportError('TIMEOUT')),
      MONZO_NETWORK_POLICY.requestTimeoutMs,
    );
    try {
      return await operation(timeout.signal);
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      const retryable =
        error instanceof MonzoTransportError &&
        (error.code === 'TIMEOUT' ||
          error.code === 'RATE_LIMITED' ||
          error.code === 'HTTP_ERROR');
      if (!retryable || attempt === MONZO_NETWORK_POLICY.maximumAttempts) {
        throw error;
      }
      const delay =
        error.retryAfterMs ??
        MONZO_NETWORK_POLICY.baseBackoffMs * 2 ** (attempt - 1);
      await sleep(delay, options.signal);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  throw new MonzoTransportError('HTTP_ERROR');
}

function abortableSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Request cancelled.', 'AbortError');
  }
}
