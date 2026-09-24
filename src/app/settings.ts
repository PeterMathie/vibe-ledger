import type { PortableExport } from '../data/local-data';
import type { Database } from '../data/database';

export interface MonzoConnectionSummary {
  readonly authState: 'DEMO_NOT_CONNECTED';
  readonly networkEnabled: false;
  readonly mockLastSyncedAt: string | null;
  readonly mockHistory: 'NONE' | 'FULL' | 'PARTIAL';
}

export function serializePortableExport(value: PortableExport): string {
  return JSON.stringify(value, null, 2);
}

export function parseRestoreText(value: string): unknown {
  if (value.trim() === '') {
    throw new Error('Restore text is empty.');
  }
  return JSON.parse(value) as unknown;
}

export function formatLocalDataChange(timestamp: string | null): string {
  if (timestamp === null) {
    return 'No local data changes yet';
  }
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export async function getMonzoConnectionSummary(
  database: Database,
): Promise<MonzoConnectionSummary> {
  const row = await database.getFirstAsync<{
    last_completed_at: string | null;
    account_count: number;
    incomplete_count: number;
  }>(
    `SELECT
       max(last_completed_at) AS last_completed_at,
       count(*) AS account_count,
       sum(CASE WHEN initial_history_complete = 0 THEN 1 ELSE 0 END)
         AS incomplete_count
     FROM monzo_sync_state;`,
  );
  return {
    authState: 'DEMO_NOT_CONNECTED',
    networkEnabled: false,
    mockLastSyncedAt:
      row === null || row.account_count === 0 ? null : row.last_completed_at,
    mockHistory:
      row === null || row.account_count === 0
        ? 'NONE'
        : row.incomplete_count > 0
          ? 'PARTIAL'
          : 'FULL',
  };
}
