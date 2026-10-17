// Optional sync with the laptop server (server/ folder). The app works fully without it.
//
// Protocol (one request):  POST {syncUrl}/sync
//   body:     { cursor, changes: { table: [records changed since our last push] } }
//   response: { cursor, changes: { table: [records the server got from elsewhere] } }
// Both sides resolve conflicts per record by updatedAt (last write wins).
import { useEffect } from 'preact/hooks';
import { changedSince } from '../core/backup';
import type { Syncable } from '../core/types';
import { db, SYNC_TABLES } from '../db/db';
import { getMeta, getSettings, setMeta } from '../db/repo';
import { mergeTables } from './backup';

export interface SyncResult { pushed: number; pulled: number }

export async function syncNow(timeoutMs = 8000): Promise<SyncResult> {
  const s = await getSettings();
  const url = s?.syncUrl?.trim().replace(/\/+$/, '');
  if (!url) throw new Error('No sync server set.');
  const lastPush = await getMeta<number>('syncLastPush', 0);
  const cursor = await getMeta<number>('syncCursor', 0);
  const startedAt = Date.now();

  const changes: Record<string, Syncable[]> = {};
  let pushed = 0;
  for (const t of SYNC_TABLES) {
    const rows = changedSince(await db.table(t).toArray(), lastPush);
    if (rows.length) { changes[t] = rows; pushed += rows.length; }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${url}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(s?.syncToken ? { Authorization: `Bearer ${s.syncToken}` } : {}) },
      body: JSON.stringify({ cursor, changes }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new Error('Server rejected the sync token.');
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = (await res.json()) as { cursor: number; changes: Record<string, Syncable[]> };

  const pulled = await mergeTables(data.changes ?? {});
  await setMeta('syncCursor', data.cursor ?? cursor);
  // Records we pulled now have old updatedAt values, so they won't be pushed back.
  await setMeta('syncLastPush', startedAt);
  await setMeta('lastSyncAt', Date.now());
  await setMeta('lastBackupAt', Date.now()); // the server keeps daily backups
  return { pushed, pulled };
}

let running = false;
/** Fire-and-forget sync; silently does nothing if no server is set or it's unreachable. */
export async function triggerSync(): Promise<void> {
  if (running) return;
  const s = await getSettings();
  if (!s?.syncUrl || !navigator.onLine) return;
  running = true;
  try { await syncNow(4000); } catch { /* not on home Wi-Fi — try again later */ } finally { running = false; }
}

/** Try to sync on app start, when the app comes back to the foreground, and every 15 min. */
export function useAutoSync() {
  useEffect(() => {
    triggerSync();
    const onVis = () => { if (!document.hidden) triggerSync(); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(triggerSync, 15 * 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, []);
}
