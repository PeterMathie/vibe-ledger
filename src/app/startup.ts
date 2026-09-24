import { openDatabaseAsync } from 'expo-sqlite';

import { expoDatabase } from '../data/expo-database';
import { migrateDatabase } from '../data/migrations';

let startup: Promise<void> | null = null;

export function initializeApplication(): Promise<void> {
  startup ??= prepareLocalDatabase();
  return startup;
}

async function prepareLocalDatabase(): Promise<void> {
  const database = await openDatabaseAsync('vibe-ledger.db');
  await migrateDatabase(expoDatabase(database));
}
