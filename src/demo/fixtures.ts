import type {
  BudgetScope,
  ClassificationSource,
  Confidence,
  EventType,
} from '../domain/enums';

export const DEMO_DATASET_ID = 'vibe-ledger-synthetic-demo';
export const DEMO_FIXTURE_VERSION = 2;
export const DEMO_CLOCK = '2026-09-24T12:00:00.000Z';

export interface DemoBudgetFixture {
  readonly monthKey: string;
  readonly currency: string;
  readonly budgetBaseMinor: number;
  readonly livingRatioBp: number;
  readonly savingRatioBp: number;
  readonly funRatioBp: number;
  readonly livingTargetMinor: number;
  readonly savingTargetMinor: number;
  readonly funTargetMinor: number;
  readonly closedAt: string | null;
}

export interface DemoSplitFixture {
  readonly id: string;
  readonly amountMinorAbs: number;
  readonly eventType: EventType;
  readonly budgetScope: BudgetScope;
  readonly categoryId: string;
}

export interface DemoTransactionFixture {
  readonly id: string;
  readonly amountMinor: number;
  readonly description: string;
  readonly merchantName: string | null;
  readonly createdAt: string;
  readonly eventType: EventType;
  readonly budgetScope: BudgetScope;
  readonly categoryId: string | null;
  readonly classificationSource: ClassificationSource;
  readonly confidence: Confidence;
  readonly countsTowardBudgetBase: boolean;
  readonly offsetId: string | null;
  readonly note: string | null;
  readonly splits?: readonly DemoSplitFixture[];
}

export const DEMO_BUDGETS: readonly DemoBudgetFixture[] = [
  {
    monthKey: '2026-08',
    currency: 'GBP',
    budgetBaseMinor: 280_000,
    livingRatioBp: 5_500,
    savingRatioBp: 2_500,
    funRatioBp: 2_000,
    livingTargetMinor: 154_000,
    savingTargetMinor: 70_000,
    funTargetMinor: 56_000,
    closedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    monthKey: '2026-09',
    currency: 'GBP',
    budgetBaseMinor: 300_000,
    livingRatioBp: 5_000,
    savingRatioBp: 3_000,
    funRatioBp: 2_000,
    livingTargetMinor: 150_000,
    savingTargetMinor: 90_000,
    funTargetMinor: 60_000,
    closedAt: null,
  },
];

export const DEMO_TRANSACTIONS: readonly DemoTransactionFixture[] = [
  transaction(
    'aug-salary',
    280_000,
    'AUGUST SYNTHETIC PAY',
    '2026-08-01T08:00:00.000Z',
    'INCOME',
    null,
    {
      countsTowardBudgetBase: true,
    },
  ),
  transaction(
    'aug-rent',
    -88_000,
    'AUGUST SYNTHETIC RENT',
    '2026-08-02T09:00:00.000Z',
    'SPEND',
    'category:rent',
  ),
  transaction(
    'aug-cinema',
    -2_400,
    'SYNTHETIC CINEMA',
    '2026-08-16T19:30:00.000Z',
    'SPEND',
    'category:cinema',
  ),
  transaction(
    'salary',
    300_000,
    'SEPTEMBER SYNTHETIC PAY',
    '2026-09-01T08:00:00.000Z',
    'INCOME',
    null,
    {
      countsTowardBudgetBase: true,
    },
  ),
  transaction(
    'rent',
    -90_000,
    'SYNTHETIC RENT',
    '2026-09-01T09:00:00.000Z',
    'SPEND',
    'category:rent',
  ),
  transaction(
    'coffee',
    -420,
    'BLACK SHEEP SYNTHETIC',
    '2026-09-02T08:15:00.000Z',
    'SPEND',
    'category:coffee',
    {
      merchantName: 'Black Sheep Coffee',
    },
  ),
  transaction(
    'tesco-split',
    -7_000,
    'TESCO SYNTHETIC SHOP',
    '2026-09-03T17:30:00.000Z',
    'SPEND',
    null,
    {
      merchantName: 'Tesco',
      splits: [
        {
          id: 'split:tesco:living',
          amountMinorAbs: 5_500,
          eventType: 'SPEND',
          budgetScope: 'INCLUDED',
          categoryId: 'category:groceries',
        },
        {
          id: 'split:tesco:fun',
          amountMinorAbs: 1_500,
          eventType: 'SPEND',
          budgetScope: 'INCLUDED',
          categoryId: 'category:nights-out',
        },
      ],
    },
  ),
  transaction(
    'moneybox',
    -40_000,
    'MONEYBOX SYNTHETIC ISA',
    '2026-09-04T10:00:00.000Z',
    'SAVING_CONTRIBUTION',
    'category:investments',
  ),
  transaction(
    'house-pot',
    -50_000,
    'SYNTHETIC HOUSE POT',
    '2026-09-05T10:00:00.000Z',
    'SAVING_CONTRIBUTION',
    'category:house-saving',
  ),
  transaction(
    'savings-withdrawal',
    500_000,
    'SYNTHETIC SAVINGS WITHDRAWAL',
    '2026-09-06T12:00:00.000Z',
    'SAVING_WITHDRAWAL',
    'category:house-saving',
  ),
  transaction(
    'own-transfer',
    -30_000,
    'SYNTHETIC OWN ACCOUNT TRANSFER',
    '2026-09-07T12:00:00.000Z',
    'INTERNAL_TRANSFER',
    null,
  ),
  transaction(
    'annual-subscription',
    -9_000,
    'SYNTHETIC ANNUAL MEMBERSHIP',
    '2026-09-08T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    {
      note: 'Underlying annual subscription spend; no synthetic monthly expense.',
    },
  ),
  transaction(
    'holiday-hotel',
    -70_000,
    'SYNTHETIC HOLIDAY HOTEL',
    '2026-09-12T18:00:00.000Z',
    'SPEND',
    'category:shopping',
    {
      budgetScope: 'EXCLUDED',
      note: 'Explicitly outside the monthly budget.',
    },
  ),
  transaction(
    'holiday-coffee',
    -400,
    'SYNTHETIC HOLIDAY COFFEE',
    '2026-09-13T08:00:00.000Z',
    'SPEND',
    'category:coffee',
  ),
  transaction(
    'clothing',
    -12_000,
    'SYNTHETIC CLOTHING SHOP',
    '2026-09-18T12:00:00.000Z',
    'SPEND',
    'category:shopping',
  ),
  transaction(
    'clothing-refund',
    12_000,
    'SYNTHETIC CLOTHING REFUND',
    '2026-09-20T12:00:00.000Z',
    'REFUND',
    null,
    {
      offsetId: 'clothing',
    },
  ),
  transaction(
    'dinner',
    -8_000,
    'SYNTHETIC RESTAURANT',
    '2026-09-21T19:00:00.000Z',
    'SPEND',
    'category:restaurants',
  ),
  transaction(
    'dinner-reimbursement',
    4_000,
    'SYNTHETIC DINNER REIMBURSEMENT',
    '2026-09-22T10:00:00.000Z',
    'REIMBURSEMENT',
    null,
    {
      offsetId: 'dinner',
    },
  ),
  transaction(
    'needs-review',
    -25_000,
    'SYNTHETIC UNKNOWN TRANSFER',
    '2026-09-23T11:00:00.000Z',
    'NEUTRAL',
    null,
    {
      classificationSource: 'DEFAULT',
      confidence: 'LOW',
      note: 'Needs review; no budget effect.',
    },
  ),
  transaction(
    'festival',
    -130_000,
    'SYNTHETIC FESTIVAL WEEKEND',
    '2026-09-25T18:00:00.000Z',
    'SPEND',
    'category:cinema',
    {
      note: 'Included synthetic spend that demonstrates proportional runover.',
    },
  ),
  transaction(
    'large-legal',
    -10_000_000,
    'SYNTHETIC LARGE LEGAL PURCHASE',
    '2026-09-24T09:00:00.000Z',
    'SPEND',
    'category:shopping',
    {
      budgetScope: 'EXCLUDED',
      note: 'Large safe-integer fixture excluded from monthly targets.',
    },
  ),
];

interface TransactionOptions {
  readonly merchantName?: string;
  readonly budgetScope?: BudgetScope;
  readonly classificationSource?: ClassificationSource;
  readonly confidence?: Confidence;
  readonly countsTowardBudgetBase?: boolean;
  readonly offsetId?: string;
  readonly note?: string;
  readonly splits?: readonly DemoSplitFixture[];
}

function transaction(
  id: string,
  amountMinor: number,
  description: string,
  createdAt: string,
  eventType: EventType,
  categoryId: string | null,
  options: TransactionOptions = {},
): DemoTransactionFixture {
  return {
    id,
    amountMinor,
    description,
    merchantName: options.merchantName ?? null,
    createdAt,
    eventType,
    budgetScope: options.budgetScope ?? 'INCLUDED',
    categoryId,
    classificationSource: options.classificationSource ?? 'IMPORT_HINT',
    confidence: options.confidence ?? 'HIGH',
    countsTowardBudgetBase: options.countsTowardBudgetBase ?? false,
    offsetId: options.offsetId ?? null,
    note: options.note ?? null,
    ...(options.splits === undefined ? {} : { splits: options.splits }),
  };
}
