import { openDatabaseAsync } from 'expo-sqlite';

import { expoDatabase } from '../data/expo-database';
import { migrateDatabase } from '../data/migrations';
import type { Database } from '../data/database';

let startup: Promise<Database> | null = null;

export function initializeApplication(): Promise<Database> {
  startup ??= prepareLocalDatabase();
  return startup;
}

async function prepareLocalDatabase(): Promise<Database> {
  const database = await openDatabaseAsync('vibe-ledger.db');
  const adapter = expoDatabase(database);
  await migrateDatabase(adapter);
  return adapter;
}
