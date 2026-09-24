import type {
  MonzoAccountPage,
  MonzoPotPage,
  MonzoTransactionPage,
} from '../src/integrations/monzo/dto';
import type { MonzoApi } from '../src/integrations/monzo/sync';

export class MockMonzoApi implements MonzoApi {
  constructor(
    readonly offline = false,
    readonly delayMs = 0,
  ) {}

  async listAccounts(): Promise<MonzoAccountPage> {
    throw new Error('MONZO_MOCK_DISABLED');
  }

  async listPots(): Promise<MonzoPotPage> {
    throw new Error('MONZO_MOCK_DISABLED');
  }

  async listTransactions(): Promise<MonzoTransactionPage> {
    throw new Error('MONZO_MOCK_DISABLED');
  }
}
