// Export / import of all data. Export uses the Web Share API when available so on an
// iPhone you can "Save to Files" (iCloud Drive) in two taps; otherwise it downloads.
import { foodCsv, lwwWinners, makeBackup, parseBackup, weightCsv, workoutsCsv, type BackupFile } from '../core/backup';
import type { Syncable } from '../core/types';
import { today } from '../core/dates';
import { db, SYNC_TABLES } from '../db/db';
import { setMeta } from '../db/repo';

export async function collectBackup(): Promise<BackupFile> {
  const tables: Record<string, Syncable[]> = {};
  for (const t of SYNC_TABLES) tables[t] = await db.table(t).toArray();
  return makeBackup(tables);
}

/** Share (iOS/Android share sheet) or download a file. Returns false if the user cancelled. */
export async function shareOrDownload(name: string, text: string, mime: string): Promise<boolean> {
  const file = new File([text], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false; // user closed the share sheet
      // fall through to a normal download
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export async function exportBackup(): Promise<boolean> {
  const b = await collectBackup();
  const ok = await shareOrDownload(`cut-backup-${today()}.json`, JSON.stringify(b), 'application/json');
  if (ok) await setMeta('lastBackupAt', Date.now());
  return ok;
}

export async function exportCsv(kind: 'workouts' | 'food' | 'weight'): Promise<void> {
  const text =
    kind === 'workouts' ? workoutsCsv(await db.sessions.toArray())
    : kind === 'food' ? foodCsv(await db.foodLogs.toArray())
    : weightCsv(await db.bodyLogs.toArray());
  await shareOrDownload(`cut-${kind}-${today()}.csv`, text, 'text/csv');
}

/**
 * Write records into the database, keeping whichever version is newer (last write wins).
 * Used by "Import backup" (merge mode) and by laptop sync. Returns how many were written.
 */
export async function mergeTables(tables: Record<string, Syncable[]>): Promise<number> {
  let n = 0;
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const [name, rows] of Object.entries(tables)) {
      if (!(SYNC_TABLES as readonly string[]).includes(name) || !rows.length) continue;
      const local = (await db.table(name).bulkGet(rows.map((r) => r.id))).filter(Boolean) as Syncable[];
      const winners = lwwWinners(local, rows);
      if (winners.length) await db.table(name).bulkPut(winners);
      n += winners.length;
    }
  });
  return n;
}

/** Import a backup file. mode "merge" keeps newer records; "replace" wipes everything first. */
export async function importBackup(file: File, mode: 'merge' | 'replace'): Promise<number> {
  const b = parseBackup(JSON.parse(await file.text()), SYNC_TABLES);
  if (mode === 'replace') {
    await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
      for (const t of SYNC_TABLES) await db.table(t).clear();
    });
  }
  return mergeTables(b.tables);
}
