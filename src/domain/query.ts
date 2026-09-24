import type { BudgetScope, EventType, SuperCategoryKey } from './enums';

export type DateFilter =
  | { readonly kind: 'DAY'; readonly date: string }
  | { readonly kind: 'MONTH'; readonly month: string }
  | {
      readonly kind: 'RANGE';
      readonly startDate: string;
      readonly endDate: string;
    };

export type AmountComparator =
  | 'EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL';

export type SubscriptionStatus =
  'DETECTED' | 'CONFIRMED' | 'MANUAL' | 'NOT_SUBSCRIPTION';

export interface LedgerQuery {
  readonly date: DateFilter;
  readonly merchant?: string;
  readonly categoryIds?: readonly string[];
  readonly superCategories?: readonly SuperCategoryKey[];
  readonly amount?: {
    readonly comparator: AmountComparator;
    readonly thresholdMinor: number;
  };
  readonly eventTypes?: readonly EventType[];
  readonly scopes?: readonly BudgetScope[];
  readonly subscriptionStatuses?: readonly SubscriptionStatus[];
}

export function monthQuery(
  month: string,
  additions: Omit<LedgerQuery, 'date'> = {},
): LedgerQuery {
  return { date: { kind: 'MONTH', month }, ...additions };
}

export function dayQuery(
  date: string,
  additions: Omit<LedgerQuery, 'date'> = {},
): LedgerQuery {
  return { date: { kind: 'DAY', date }, ...additions };
}

export function queryMonth(query: LedgerQuery): string | null {
  if (query.date.kind === 'MONTH') {
    return query.date.month;
  }
  if (query.date.kind === 'DAY') {
    return query.date.date.slice(0, 7);
  }
  return query.date.startDate.slice(0, 7) === query.date.endDate.slice(0, 7)
    ? query.date.startDate.slice(0, 7)
    : null;
}
