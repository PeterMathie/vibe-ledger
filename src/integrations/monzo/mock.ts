import type {
  MonzoAccountPage,
  MonzoPotPage,
  MonzoTransactionDto,
  MonzoTransactionPage,
} from './dto';
import type { MonzoApi } from './sync';
import { MonzoTransportError } from './transport';

const ACCOUNT_ID = 'acc_mock_household';

const TRANSACTIONS: readonly MonzoTransactionDto[] = [
  {
    id: 'tx_mock_salary',
    account_id: ACCOUNT_ID,
    amount: 300_000,
    currency: 'GBP',
    description: 'SYNTHETIC SALARY',
    created: '2026-09-01T08:00:00.000Z',
    settled: '2026-09-01T08:00:00.000Z',
    category: 'income',
  },
  {
    id: 'tx_mock_coffee',
    account_id: ACCOUNT_ID,
    amount: -420,
    currency: 'GBP',
    description: 'SYNTHETIC COFFEE',
    created: '2026-09-20T09:30:00.000Z',
    settled: '2026-09-21T09:30:00.000Z',
    category: 'eating_out',
    merchant: { id: 'merch_mock_coffee', name: 'Synthetic Coffee' },
  },
];

export class MockMonzoApi implements MonzoApi {
  requestCount = 0;

  constructor(
    readonly offline = false,
    readonly delayMs = 0,
  ) {}

  async listAccounts(signal?: AbortSignal): Promise<MonzoAccountPage> {
    await this.beforeRequest(signal);
    return {
      accounts: [
        {
          id: ACCOUNT_ID,
          description: 'Synthetic Monzo account',
          created: '2026-01-01T00:00:00.000Z',
          type: 'uk_retail',
        },
      ],
    };
  }

  async listPots(
    _accountId: string,
    signal?: AbortSignal,
  ): Promise<MonzoPotPage> {
    await this.beforeRequest(signal);
    return {
      pots: [
        {
          id: 'pot_mock_house',
          name: 'Synthetic house saving',
          balance: 200_000,
          currency: 'GBP',
          created: '2026-01-02T00:00:00.000Z',
          updated: '2026-09-20T00:00:00.000Z',
          deleted: false,
        },
      ],
    };
  }

  async listTransactions(
    _accountId: string,
    request: { readonly since: string | null; readonly cursor: string | null },
    signal?: AbortSignal,
  ): Promise<MonzoTransactionPage> {
    await this.beforeRequest(signal);
    const page = request.cursor === null ? 0 : 1;
    return {
      transactions: TRANSACTIONS.filter(
        ({ created }) => request.since === null || created >= request.since,
      ).slice(page, page + 1),
      nextCursor: page === 0 ? 'mock-page-2' : null,
    };
  }

  private async beforeRequest(signal?: AbortSignal): Promise<void> {
    this.requestCount += 1;
    if (this.offline) throw new MonzoTransportError('OFFLINE');
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Mock sync cancelled.', 'AbortError'));
          },
          { once: true },
        );
      });
    }
  }
}
