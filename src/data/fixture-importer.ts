import { DomainValidationError } from '../domain/errors';
import { money } from '../domain/money';
import type { Database } from './database';

export interface FixtureEvent {
  readonly id: string;
  readonly amount_minor: number;
  readonly currency?: string;
  readonly description: string;
  readonly created_at?: string;
  readonly source_account_id?: string;
}

export interface SemanticFixture {
  readonly meta: {
    readonly currency: string;
    readonly month: string;
  };
  readonly events: readonly FixtureEvent[];
}

export interface FixtureImportResult {
  readonly inserted: number;
  readonly unchanged: number;
}

export async function importFixture(
  database: Database,
  fixture: SemanticFixture,
  importedAt: string,
): Promise<FixtureImportResult> {
  const importedDate = new Date(importedAt);
  if (Number.isNaN(importedDate.valueOf())) {
    throw new DomainValidationError('Fixture import timestamp is invalid.');
  }

  let inserted = 0;
  let unchanged = 0;

  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    for (const event of fixture.events) {
      const currency = event.currency ?? fixture.meta.currency;
      money(event.amount_minor, currency);
      const createdAt =
        event.created_at ?? `${fixture.meta.month}-15T12:00:00.000Z`;
      const rawPayload = JSON.stringify(event);
      const result = await database.runAsync(
        `INSERT INTO raw_transactions (
          id, source, source_transaction_id, source_account_id, amount_minor,
          currency, description, merchant_id, merchant_name, source_category,
          created_at, settled_at, raw_payload_json, first_seen_at,
          last_synced_at, source_deleted
        ) VALUES (?, 'fixture', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(source, source_transaction_id) DO NOTHING;`,
        `fixture:${event.id}`,
        event.id,
        event.source_account_id ?? null,
        event.amount_minor,
        currency,
        event.description,
        createdAt,
        createdAt,
        rawPayload,
        importedAt,
        importedAt,
      );
      if (result.changes === 1) {
        inserted += 1;
      } else {
        unchanged += 1;
      }
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }

  return { inserted, unchanged };
}
