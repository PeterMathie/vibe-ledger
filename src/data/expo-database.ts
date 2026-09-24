import type { SQLiteDatabase } from 'expo-sqlite';

import type { Database, DatabaseValue } from './database';

export function expoDatabase(database: SQLiteDatabase): Database {
  return {
    execAsync: (sql) => database.execAsync(sql),
    runAsync: async (sql, ...params) => {
      const result = await database.runAsync(sql, ...params);
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowId,
      };
    },
    getFirstAsync: <T>(sql: string, ...params: readonly DatabaseValue[]) =>
      database.getFirstAsync<T>(sql, ...params),
    getAllAsync: <T>(sql: string, ...params: readonly DatabaseValue[]) =>
      database.getAllAsync<T>(sql, ...params),
  };
}
