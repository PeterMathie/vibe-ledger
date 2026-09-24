import { DomainValidationError } from './errors';
import { formatMoney, parseDecimalMoney } from './money';
import type {
  AmountComparator,
  DateFilter,
  LedgerQuery,
  Weekday,
} from './query';
import type { Category } from './types';

export interface SearchCatalog {
  readonly categories: readonly Category[];
  readonly merchants: readonly string[];
}

export interface SearchChip {
  readonly id: string;
  readonly label: string;
  readonly kind:
    | 'DATE'
    | 'MERCHANT'
    | 'CATEGORY'
    | 'SUPER_CATEGORY'
    | 'AMOUNT'
    | 'WEEKDAY'
    | 'REVIEW';
}

export interface ParsedLedgerSearch {
  readonly query: LedgerQuery;
  readonly chips: readonly SearchChip[];
  readonly unrecognizedTokens: readonly string[];
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const WEEKDAYS: Readonly<Record<string, Weekday>> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function parseLedgerSearch(
  input: string,
  catalog: SearchCatalog,
  today: string,
): ParsedLedgerSearch {
  assertIsoDate(today);
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const consumed = new Set<number>();
  const tokens = normalized === '' ? [] : normalized.split(' ');
  const chips: SearchChip[] = [];
  const query: MutableLedgerQuery = {
    date: { kind: 'MONTH', month: today.slice(0, 7) },
  };

  const amount = findAmount(tokens, consumed);
  if (amount !== null) {
    query.amount = amount.value;
    chips.push({ id: 'amount', label: amount.label, kind: 'AMOUNT' });
  }

  const date = findDate(tokens, consumed, today);
  if (date !== null) {
    query.date = date.value;
    chips.push({ id: 'date', label: date.label, kind: 'DATE' });
  }

  if (consumePhrase(tokens, consumed, ['needs', 'review'])) {
    query.needsReview = true;
    chips.push({ id: 'review', label: 'Needs Review', kind: 'REVIEW' });
  }

  const superCategories = [
    ['living', 'LIVING'],
    ['saving', 'SAVING'],
    ['fun', 'FUN'],
  ] as const;
  for (const [label, value] of superCategories) {
    const index = availableIndex(tokens, consumed, label);
    if (index >= 0) {
      consumed.add(index);
      query.superCategories = [value];
      chips.push({
        id: 'super-category',
        label: titleCase(label),
        kind: 'SUPER_CATEGORY',
      });
      break;
    }
  }

  if (availableIndex(tokens, consumed, 'weekends') >= 0) {
    consumed.add(availableIndex(tokens, consumed, 'weekends'));
    query.weekdays = [0, 6];
    chips.push({ id: 'weekday', label: 'Weekends', kind: 'WEEKDAY' });
  } else {
    for (const [label, weekday] of Object.entries(WEEKDAYS)) {
      const index = availableIndex(tokens, consumed, label);
      if (index >= 0) {
        consumed.add(index);
        query.weekdays = [weekday];
        chips.push({
          id: 'weekday',
          label: titleCase(label),
          kind: 'WEEKDAY',
        });
        break;
      }
    }
  }

  const category = findCatalogMatch(
    tokens,
    consumed,
    catalog.categories.map((item) => ({
      value: item.id,
      label: item.name,
      normalized: item.name.toLowerCase(),
    })),
  );
  if (category !== null) {
    query.categoryIds = [category.value];
    chips.push({
      id: 'category',
      label: category.label,
      kind: 'CATEGORY',
    });
  }

  const merchant = findCatalogMatch(
    tokens,
    consumed,
    catalog.merchants.map((label) => ({
      value: label,
      label,
      normalized: label.toLowerCase(),
    })),
  );
  if (merchant !== null) {
    query.merchant = merchant.value;
    chips.push({
      id: 'merchant',
      label: merchant.label,
      kind: 'MERCHANT',
    });
  }

  return {
    query,
    chips,
    unrecognizedTokens: tokens.filter((_, index) => !consumed.has(index)),
  };
}

function findAmount(
  tokens: readonly string[],
  consumed: Set<number>,
): {
  readonly value: {
    readonly comparator: AmountComparator;
    readonly thresholdMinor: number;
  };
  readonly label: string;
} | null {
  const comparators: Readonly<
    Record<string, { comparator: AmountComparator; symbol: string }>
  > = {
    over: { comparator: 'GREATER_THAN', symbol: '>' },
    above: { comparator: 'GREATER_THAN', symbol: '>' },
    under: { comparator: 'LESS_THAN', symbol: '<' },
    below: { comparator: 'LESS_THAN', symbol: '<' },
  };
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const match = comparators[tokens[index] ?? ''];
    const amountToken = tokens[index + 1] ?? '';
    const amountMatch = /^(?:£)?(\d+)(?:\.(\d{1,2}))?$/.exec(amountToken);
    if (match === undefined || amountMatch === null) {
      continue;
    }
    const amount = parseDecimalMoney(amountToken.replace('£', ''), 'GBP');
    const thresholdMinor = amount.amountMinor;
    consumed.add(index);
    consumed.add(index + 1);
    return {
      value: { comparator: match.comparator, thresholdMinor },
      label: `Amount ${match.symbol} ${formatMoney(amount, 'en-GB')}`,
    };
  }
  return null;
}

function findDate(
  tokens: readonly string[],
  consumed: Set<number>,
  today: string,
): { readonly value: DateFilter; readonly label: string } | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      assertIsoDate(token);
      consumed.add(index);
      return { value: { kind: 'DAY', date: token }, label: token };
    }
  }
  if (consumePhrase(tokens, consumed, ['this', 'month'])) {
    return {
      value: { kind: 'MONTH', month: today.slice(0, 7) },
      label: 'This month',
    };
  }
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      tokens[index] === 'last' &&
      /^\d+$/.test(tokens[index + 1] ?? '') &&
      /^months?$/.test(tokens[index + 2] ?? '')
    ) {
      const count = Number(tokens[index + 1]);
      if (count < 1 || count > 120) {
        throw new DomainValidationError(
          'Search month range must be between 1 and 120.',
        );
      }
      consumed.add(index);
      consumed.add(index + 1);
      consumed.add(index + 2);
      const end = endOfMonth(today.slice(0, 7));
      const start = shiftMonth(today.slice(0, 7), -(count - 1));
      return {
        value: { kind: 'RANGE', startDate: `${start}-01`, endDate: end },
        label: `Last ${count} months`,
      };
    }
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const year = tokens[index] ?? '';
    if (/^\d{4}$/.test(year)) {
      consumed.add(index);
      return {
        value: {
          kind: 'RANGE',
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
        },
        label: year,
      };
    }
  }
  for (let monthIndex = 0; monthIndex < MONTHS.length; monthIndex += 1) {
    const monthName = MONTHS[monthIndex];
    if (monthName === undefined) {
      continue;
    }
    const index = availableIndex(tokens, consumed, monthName);
    if (index < 0) {
      continue;
    }
    consumed.add(index);
    const yearToken = tokens[index + 1];
    const year =
      yearToken !== undefined && /^\d{4}$/.test(yearToken)
        ? yearToken
        : today.slice(0, 4);
    if (yearToken === year) {
      consumed.add(index + 1);
    }
    const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return {
      value: { kind: 'MONTH', month },
      label: `${titleCase(monthName)} ${year}`,
    };
  }
  return null;
}

function findCatalogMatch(
  tokens: readonly string[],
  consumed: Set<number>,
  catalog: readonly {
    readonly value: string;
    readonly label: string;
    readonly normalized: string;
  }[],
): { readonly value: string; readonly label: string } | null {
  for (const candidate of [...catalog].sort(
    (left, right) => right.normalized.length - left.normalized.length,
  )) {
    const parts = candidate.normalized.split(' ');
    for (let start = 0; start <= tokens.length - parts.length; start += 1) {
      if (
        parts.every(
          (part, offset) =>
            !consumed.has(start + offset) && tokens[start + offset] === part,
        )
      ) {
        parts.forEach((_, offset) => consumed.add(start + offset));
        return candidate;
      }
    }
  }
  return null;
}

function consumePhrase(
  tokens: readonly string[],
  consumed: Set<number>,
  phrase: readonly string[],
): boolean {
  for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
    if (
      phrase.every(
        (token, offset) =>
          !consumed.has(start + offset) && tokens[start + offset] === token,
      )
    ) {
      phrase.forEach((_, offset) => consumed.add(start + offset));
      return true;
    }
  }
  return false;
}

function availableIndex(
  tokens: readonly string[],
  consumed: ReadonlySet<number>,
  token: string,
): number {
  return tokens.findIndex(
    (candidate, index) => candidate === token && !consumed.has(index),
  );
}

function shiftMonth(month: string, offset: number): string {
  const [yearText, monthText] = month.split('-');
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function endOfMonth(month: string): string {
  const next = shiftMonth(month, 1);
  const [year, monthNumber] = next.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1, 0));
  return `${month}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function assertIsoDate(value: string): void {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new DomainValidationError('Search date must be a valid YYYY-MM-DD.');
  }
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

interface MutableLedgerQuery {
  date: DateFilter;
  merchant?: string;
  categoryIds?: readonly string[];
  superCategories?: NonNullable<LedgerQuery['superCategories']>;
  amount?: NonNullable<LedgerQuery['amount']>;
  weekdays?: readonly Weekday[];
  needsReview?: boolean;
}
