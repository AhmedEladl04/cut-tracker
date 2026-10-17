// Small helpers around the database so screens don't repeat themselves.
// Rule: every write goes through `save()` / `remove()` so updatedAt is always set —
// the sync server relies on it for last-write-wins.
import { searchKeysFor } from '../core/search';
import type { BodyLog, CardioLog, Food, FoodLog, OneRmChange, Recipe, Session, Settings, Swap, Syncable } from '../core/types';
import seedJson from '../../foods_seed_eg.json';
import { db, newId, type SyncTable } from './db';

type Row = Syncable & Record<string, unknown>;

/** Which record type lives in which table (lets TypeScript check what we save). */
export interface TableMap {
  settings: Settings; sessions: Session; swaps: Swap; foods: Food; recipes: Recipe;
  foodLogs: FoodLog; bodyLogs: BodyLog; cardio: CardioLog; oneRmHistory: OneRmChange;
}
/** A record without id/updatedAt (we fill those in). `id` may be given to update. */
export type Draft<T> = Omit<T, 'updatedAt' | 'id'> & { id?: string };

/** Insert or update a record, stamping updatedAt. Returns the saved record. */
export async function save<K extends SyncTable>(table: K, rec: Draft<TableMap[K]>): Promise<TableMap[K]> {
  const row = { ...rec, id: rec.id ?? newId(), updatedAt: Date.now() } as unknown as TableMap[K];
  if (table === 'foods') (row as unknown as Food).searchKeys = searchKeysFor(row as unknown as Food);
  await db.table(table).put(row);
  return row;
}

/** Soft delete: keep a tombstone so other devices/the server also delete it. */
export async function remove(table: SyncTable, id: string): Promise<void> {
  const row = (await db.table(table).get(id)) as Row | undefined;
  if (row) await db.table(table).put({ ...row, deleted: true, updatedAt: Date.now() });
}

export const alive = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

// ---------- Device-only meta values ----------
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key);
  return m === undefined ? fallback : (m.value as T);
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });

// ---------- Settings ----------
export const getSettings = () => db.settings.get('me');

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await save('settings', { ...(cur as Settings), ...patch, id: 'me' });
}

// ---------- Seed foods (foods_seed_eg.json) ----------
interface SeedFood { id: string; nameEn: string; nameAr: string; aliases: string[]; per100: Food['per100']; servings: Food['servings']; category?: string }
const seed = seedJson as { version: number; foods: SeedFood[] };

/**
 * Copy seed foods into IndexedDB on first launch (and add new ones when the seed file
 * gets a new version). Existing rows are never overwritten, so your edits survive.
 * updatedAt = 0 → any edited/synced copy always wins.
 */
export async function ensureSeedFoods(): Promise<void> {
  const have = await getMeta<number>('seedVersion', 0);
  if (have >= seed.version) return;
  await db.transaction('rw', db.foods, db.meta, async () => {
    for (const f of seed.foods) {
      const id = `seed:${f.id}`;
      if (await db.foods.get(id)) continue;
      const food: Food = { ...f, id, source: 'estimate', updatedAt: 0 };
      food.searchKeys = searchKeysFor(food);
      await db.foods.put(food);
    }
    await db.meta.put({ key: 'seedVersion', value: seed.version });
  });
}

/** Ask the browser not to evict our data (important on iOS). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
