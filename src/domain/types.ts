import type {
  BudgetBaseMode,
  BudgetScope,
  ClassificationSource,
  Confidence,
  EventType,
  SuperCategoryKey,
} from './enums';

export interface RawTransaction {
  readonly id: string;
  readonly source: string;
  readonly sourceTransactionId: string;
  readonly sourceAccountId: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly merchantId: string | null;
  readonly merchantName: string | null;
  readonly sourceCategory: string | null;
  readonly createdAt: string;
  readonly settledAt: string | null;
  readonly rawPayloadJson: string;
  readonly firstSeenAt: string;
  readonly lastSyncedAt: string;
  readonly sourceDeleted: boolean;
}

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly superCategory: SuperCategoryKey;
  readonly defaultBudgetScope: BudgetScope;
}

export interface Classification {
  readonly id: string;
  readonly rawTransactionId: string;
  readonly eventType: EventType;
  readonly budgetScope: BudgetScope;
  readonly categoryId: string | null;
  readonly classificationSource: ClassificationSource;
  readonly confidence: Confidence;
  readonly countsTowardBudgetBase: boolean;
  readonly offsetRawTransactionId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransactionSplit {
  readonly id: string;
  readonly rawTransactionId: string;
  readonly amountMinorAbs: number;
  readonly eventType: EventType;
  readonly budgetScope: BudgetScope;
  readonly categoryId: string | null;
  readonly classificationSource: ClassificationSource;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ClassifiedTransaction {
  readonly raw: RawTransaction;
  readonly classification: Classification;
  readonly category: Category | null;
  readonly splits: readonly TransactionSplit[];
  readonly splitCategories: readonly Category[];
}

export interface MonthlyBudget {
  readonly monthKey: string;
  readonly currency: string;
  readonly budgetBaseMinor: number;
  readonly budgetBaseMode: BudgetBaseMode;
  readonly livingRatioBp: number;
  readonly savingRatioBp: number;
  readonly funRatioBp: number;
  readonly livingTargetMinor: number;
  readonly savingTargetMinor: number;
  readonly funTargetMinor: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
}

export interface ClassificationRule {
  readonly id: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly matchType: 'merchant_name';
  readonly matchValue: string;
  readonly resultEventType: EventType;
  readonly resultCategoryId: string | null;
  readonly resultBudgetScope: BudgetScope | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SubscriptionDetectionState = 'DETECTED' | 'CONFIRMED' | 'MANUAL';
export type RenewalIntent = 'COMMITTED' | 'LIKELY' | 'UNKNOWN' | 'NOT_RENEWING';

export interface Subscription {
  readonly id: string;
  readonly name: string;
  readonly merchantMatch: string | null;
  readonly billingAmountMinor: number;
  readonly billingCurrency: string;
  readonly intervalMonths: number | null;
  readonly intervalDays: number | null;
  readonly lastPaymentDate: string | null;
  readonly nextExpectedDate: string | null;
  readonly detectionState: SubscriptionDetectionState;
  readonly renewalIntent: RenewalIntent;
  readonly categoryId: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionReservePlan {
  readonly id: string;
  readonly subscriptionId: string;
  readonly targetAmountMinor: number;
  readonly targetCurrency: string;
  readonly reservedAmountMinor: number;
  readonly targetDate: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
