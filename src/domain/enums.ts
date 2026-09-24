import { DomainValidationError } from './errors';

export const EVENT_TYPES = [
  'INCOME',
  'SPEND',
  'SAVING_CONTRIBUTION',
  'SAVING_WITHDRAWAL',
  'INTERNAL_TRANSFER',
  'REFUND',
  'REIMBURSEMENT',
  'DEBT_PAYMENT',
  'NEUTRAL',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const BUDGET_SCOPES = ['INCLUDED', 'EXCLUDED'] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export const CLASSIFICATION_SOURCES = [
  'MANUAL',
  'RULE',
  'SUBSCRIPTION',
  'TRANSFER_RULE',
  'IMPORT_HINT',
  'DEFAULT',
] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW', 'MANUAL'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const SUPER_CATEGORY_KEYS = ['LIVING', 'SAVING', 'FUN'] as const;
export type SuperCategoryKey = (typeof SUPER_CATEGORY_KEYS)[number];

export const BUDGET_BASE_MODES = ['AUTO', 'MANUAL'] as const;
export type BudgetBaseMode = (typeof BUDGET_BASE_MODES)[number];

export function parseEnumValue<const T extends readonly string[]>(
  values: T,
  value: unknown,
  label: string,
): T[number] {
  if (typeof value === 'string' && values.includes(value)) {
    return value as T[number];
  }
  throw new DomainValidationError(`Unknown ${label}: ${String(value)}.`);
}
