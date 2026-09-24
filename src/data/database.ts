export type DatabaseValue = string | number | null | Uint8Array;

export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: readonly DatabaseValue[]
  ): Promise<{ readonly changes: number; readonly lastInsertRowId: number }>;
  getFirstAsync<T>(
    sql: string,
    ...params: readonly DatabaseValue[]
  ): Promise<T | null>;
  getAllAsync<T>(
    sql: string,
    ...params: readonly DatabaseValue[]
  ): Promise<readonly T[]>;
}
