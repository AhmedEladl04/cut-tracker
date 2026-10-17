// IndexedDB schema (via Dexie). Everything here lives only on the phone.
//
// Dexie quick primer (for a Java/Python dev):
//  - `stores({ name: 'pk, idx1, *multiIdx, [a+b]' })` declares tables. First entry is the
//    primary key; the rest are indexes. `*x` = one index entry per array element.
//  - Every call returns a Promise; `await` it (like Python's asyncio).
import Dexie, { type Table } from 'dexie';
import type { BodyLog, CardioLog, Food, FoodLog, OneRmChange, Recipe, Session, Settings, Swap } from '../core/types';

/** Device-only key/value store (never synced): seed version, timer, last sync, banners. */
export interface Meta { key: string; value: unknown }

export class CutDB extends Dexie {
  settings!: Table<Settings, string>;
  sessions!: Table<Session, string>;
  swaps!: Table<Swap, string>;
  foods!: Table<Food, string>;
  recipes!: Table<Recipe, string>;
  foodLogs!: Table<FoodLog, string>;
  bodyLogs!: Table<BodyLog, string>;
  cardio!: Table<CardioLog, string>;
  oneRmHistory!: Table<OneRmChange, string>;
  meta!: Table<Meta, string>;

  constructor(name = 'cut-tracker') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      sessions: 'id, [week+day], date, status, updatedAt',
      swaps: 'id, updatedAt',
      foods: 'id, barcode, *searchKeys, lastUsedAt, updatedAt',
      recipes: 'id, updatedAt',
      foodLogs: 'id, date, foodId, updatedAt',
      bodyLogs: 'id, updatedAt',
      cardio: 'id, date, updatedAt',
      oneRmHistory: 'id, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new CutDB();

/** Tables included in backups and sync (everything except device-only `meta`). */
export const SYNC_TABLES = ['settings', 'sessions', 'swaps', 'foods', 'recipes', 'foodLogs', 'bodyLogs', 'cardio', 'oneRmHistory'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Random unique id. crypto.randomUUID only exists on HTTPS/localhost, so fall back on plain-HTTP LAN dev. */
export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
