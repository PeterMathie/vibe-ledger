export class DomainValidationError extends Error {
  override readonly name: string = 'DomainValidationError';
}

export class CurrencyMismatchError extends DomainValidationError {
  override readonly name: string = 'CurrencyMismatchError';
}
