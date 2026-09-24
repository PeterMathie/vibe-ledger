export interface MonzoAccountDto {
  readonly id: string;
  readonly description: string;
  readonly created: string;
  readonly type?: string;
  readonly closed?: boolean;
}

export interface MonzoMerchantDto {
  readonly id: string;
  readonly name: string;
}

export interface MonzoTransactionDto {
  readonly id: string;
  readonly account_id?: string;
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  readonly created: string;
  readonly settled?: string;
  readonly category?: string;
  readonly merchant?: string | MonzoMerchantDto | null;
  readonly is_load?: boolean;
  readonly deleted?: boolean;
}

export interface MonzoPotDto {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly currency: string;
  readonly created: string;
  readonly updated: string;
  readonly deleted: boolean;
}

export interface MonzoAccountPage {
  readonly accounts: readonly MonzoAccountDto[];
}

export interface MonzoPotPage {
  readonly pots: readonly MonzoPotDto[];
}

export interface MonzoTransactionPage {
  readonly transactions: readonly MonzoTransactionDto[];
  readonly nextCursor: string | null;
}
