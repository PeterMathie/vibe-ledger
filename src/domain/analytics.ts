import type { SuperCategoryKey } from './enums';
import type { LedgerQuery } from './query';

export type TrendMeasure =
  'INCLUDED_SPENDING' | 'SAVING_CONTRIBUTIONS' | 'NET_SAVINGS_MOVEMENT';

export interface TrendSeriesRequest {
  readonly query: LedgerQuery;
  readonly measure: TrendMeasure;
  readonly grouping:
    | { readonly kind: 'TOTAL_BY_SUPER_CATEGORY' }
    | {
        readonly kind: 'CATEGORIES_WITHIN_SUPER_CATEGORY';
        readonly superCategory: SuperCategoryKey;
      }
    | { readonly kind: 'SINGLE_CATEGORY'; readonly categoryId: string };
}

export interface TrendPoint {
  readonly month: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly targetMinor: number | null;
  readonly drillDown: LedgerQuery;
}

export interface TrendSeries {
  readonly id: string;
  readonly label: string;
  readonly measure: TrendMeasure;
  readonly superCategory: SuperCategoryKey | null;
  readonly categoryId: string | null;
  readonly points: readonly TrendPoint[];
}

/**
 * Total allocation charts may place Living/Fun included spending beside Saving
 * contributions, but each series retains its explicit measure. They must never
 * be merged into one ambiguous "spend" value.
 */
export interface AllocationTrendContract {
  readonly living: TrendSeries & {
    readonly measure: 'INCLUDED_SPENDING';
    readonly superCategory: 'LIVING';
  };
  readonly saving: TrendSeries & {
    readonly measure: 'SAVING_CONTRIBUTIONS';
    readonly superCategory: 'SAVING';
  };
  readonly fun: TrendSeries & {
    readonly measure: 'INCLUDED_SPENDING';
    readonly superCategory: 'FUN';
  };
}
