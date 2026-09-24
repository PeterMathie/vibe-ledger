import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { Database, DatabaseValue } from '../../src/data/database';

export class NodeDatabase implements Database {
  readonly native = new DatabaseSync(':memory:');

  async execAsync(sql: string): Promise<void> {
    this.native.exec(sql);
  }

  async runAsync(
    sql: string,
    ...params: readonly DatabaseValue[]
  ): Promise<{ readonly changes: number; readonly lastInsertRowId: number }> {
    const result = this.native.prepare(sql).run(...params.map(toNodeValue));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: readonly DatabaseValue[]
  ): Promise<T | null> {
    return (
      (this.native.prepare(sql).get(...params.map(toNodeValue)) as
        T | undefined) ?? null
    );
  }

  async getAllAsync<T>(
    sql: string,
    ...params: readonly DatabaseValue[]
  ): Promise<readonly T[]> {
    return this.native.prepare(sql).all(...params.map(toNodeValue)) as T[];
  }

  close(): void {
    this.native.close();
  }
}

function toNodeValue(value: DatabaseValue): SQLInputValue {
  return value;
}
