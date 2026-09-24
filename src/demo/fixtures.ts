import type {
  BudgetScope,
  ClassificationSource,
  Confidence,
  EventType,
} from '../domain/enums';

export const DEMO_DATASET_ID = 'vibe-ledger-synthetic-demo';
export const DEMO_FIXTURE_VERSION = 3;
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
  readonly currency: string;
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

export interface DemoSubscriptionFixture {
  readonly id: string;
  readonly name: string;
  readonly merchantMatch: string | null;
  readonly billingAmountMinor: number;
  readonly billingCurrency: string;
  readonly intervalMonths: number | null;
  readonly intervalDays: number | null;
  readonly lastPaymentDate: string | null;
  readonly nextExpectedDate: string | null;
  readonly detectionState: 'DETECTED' | 'CONFIRMED' | 'MANUAL';
  readonly renewalIntent: 'COMMITTED' | 'LIKELY' | 'UNKNOWN' | 'NOT_RENEWING';
  readonly active: boolean;
  readonly transactionIds: readonly string[];
  readonly reservePlan?: {
    readonly targetAmountMinor: number;
    readonly reservedAmountMinor: number;
    readonly targetDate: string;
  };
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
      merchantName: 'Studio Annual',
      note: 'Underlying annual subscription spend; no synthetic monthly expense.',
    },
  ),
  transaction(
    'annual-subscription-2024',
    -9_000,
    'STUDIO ANNUAL',
    '2024-09-08T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Studio Annual' },
  ),
  transaction(
    'annual-subscription-2025',
    -9_000,
    'STUDIO ANNUAL',
    '2025-09-08T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Studio Annual' },
  ),
  transaction(
    'music-monthly-january',
    -1_199,
    'MELODY MUSIC',
    '2026-01-05T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Melody Music' },
  ),
  transaction(
    'music-monthly-february',
    -1_249,
    'MELODY MUSIC PAYMENT',
    '2026-02-05T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Melody Musc' },
  ),
  transaction(
    'music-monthly-march',
    -1_199,
    'MELODY MUSIC CARD',
    '2026-03-05T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Melody Music UK' },
  ),
  transaction(
    'usd-tool-2022',
    -20_000,
    'GLOBAL TOOL',
    '2022-09-10T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { currency: 'USD', merchantName: 'Global Tool' },
  ),
  transaction(
    'usd-tool-2024',
    -20_000,
    'GLOBAL TOOL',
    '2024-09-10T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { currency: 'USD', merchantName: 'Global Tool' },
  ),
  transaction(
    'usd-tool-2026',
    -20_000,
    'GLOBAL TOOL',
    '2026-09-10T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { currency: 'USD', merchantName: 'Global Tool' },
  ),
  transaction(
    'irregular-one',
    -2_000,
    'MARKET CLUB',
    '2026-01-02T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Market Club' },
  ),
  transaction(
    'irregular-two',
    -2_050,
    'MARKET CLUB',
    '2026-02-20T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Market Club' },
  ),
  transaction(
    'irregular-three',
    -1_990,
    'MARKET CLUB',
    '2026-06-01T12:00:00.000Z',
    'SPEND',
    'category:subscriptions',
    { merchantName: 'Market Club' },
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

export const DEMO_SUBSCRIPTIONS: readonly DemoSubscriptionFixture[] = [
  {
    id: 'demo-subscription:studio-annual',
    name: 'Studio Annual',
    merchantMatch: 'studio annual',
    billingAmountMinor: 9_000,
    billingCurrency: 'GBP',
    intervalMonths: 12,
    intervalDays: null,
    lastPaymentDate: '2026-09-08',
    nextExpectedDate: '2027-09-08',
    detectionState: 'CONFIRMED',
    renewalIntent: 'COMMITTED',
    active: true,
    transactionIds: [
      'annual-subscription-2024',
      'annual-subscription-2025',
      'annual-subscription',
    ],
    reservePlan: {
      targetAmountMinor: 9_000,
      reservedAmountMinor: 3_000,
      targetDate: '2027-03-24',
    },
  },
  {
    id: 'demo-subscription:global-tool',
    name: 'Global Tool',
    merchantMatch: 'global tool',
    billingAmountMinor: 20_000,
    billingCurrency: 'USD',
    intervalMonths: 24,
    intervalDays: null,
    lastPaymentDate: '2026-09-10',
    nextExpectedDate: '2028-09-10',
    detectionState: 'CONFIRMED',
    renewalIntent: 'COMMITTED',
    active: true,
    transactionIds: ['usd-tool-2022', 'usd-tool-2024', 'usd-tool-2026'],
  },
  {
    id: 'demo-subscription:piano',
    name: 'Piano lessons',
    merchantMatch: null,
    billingAmountMinor: 4_500,
    billingCurrency: 'GBP',
    intervalDays: 28,
    intervalMonths: null,
    lastPaymentDate: '2026-09-20',
    nextExpectedDate: '2026-10-18',
    detectionState: 'MANUAL',
    renewalIntent: 'LIKELY',
    active: true,
    transactionIds: [],
  },
  {
    id: 'demo-subscription:old-news',
    name: 'Old News',
    merchantMatch: 'old news',
    billingAmountMinor: 799,
    billingCurrency: 'GBP',
    intervalMonths: 1,
    intervalDays: null,
    lastPaymentDate: '2026-08-01',
    nextExpectedDate: null,
    detectionState: 'MANUAL',
    renewalIntent: 'NOT_RENEWING',
    active: false,
    transactionIds: [],
  },
];

interface TransactionOptions {
  readonly currency?: string;
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
    currency: options.currency ?? 'GBP',
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
