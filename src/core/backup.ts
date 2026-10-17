// Backup file format, last-write-wins merging (used by import AND laptop sync), and CSV export.
import type { BodyLog, FoodLog, Session, Syncable } from './types';

export const BACKUP_APP = 'cut-tracker';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  tables: Record<string, Syncable[]>;
}

export function makeBackup(tables: Record<string, Syncable[]>, now = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

/** Throws a readable error if the JSON isn't one of our backups. */
export function parseBackup(json: unknown, knownTables: readonly string[]): BackupFile {
  const b = json as Partial<BackupFile>;
  if (!b || b.app !== BACKUP_APP || typeof b.tables !== 'object' || b.tables === null) throw new Error('This file is not a Cut Tracker backup.');
  if ((b.version ?? 0) > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app — update first.');
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!knownTables.includes(name)) throw new Error(`Unknown table "${name}" in backup.`);
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r.id !== 'string' || typeof r.updatedAt !== 'number')) {
      throw new Error(`Table "${name}" has invalid records.`);
    }
  }
  return b as BackupFile;
}

/**
 * Last-write-wins: of two versions of the same record (same id) keep the one with the
 * larger updatedAt. Returns only the incoming records that should overwrite local ones.
 */
export function lwwWinners<T extends Syncable>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  const winners = new Map<string, T>();
  for (const r of incoming) {
    const cur = winners.get(r.id) ?? byId.get(r.id);
    if (!cur || r.updatedAt > cur.updatedAt) winners.set(r.id, r);
  }
  return [...winners.values()];
}

/** Records changed after `since` (ms) — what we push to the sync server. */
export const changedSince = <T extends Syncable>(rows: T[], since: number) => rows.filter((r) => r.updatedAt > since);

// ---------- CSV ----------

/** Quote a CSV cell when needed (commas, quotes, new lines). */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // Leading BOM so Excel opens Arabic text correctly.
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function workoutsCsv(sessions: Session[]): string {
  const rows: unknown[][] = [];
  for (const s of [...sessions].filter((x) => !x.deleted).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.exercises) {
      e.sets.forEach((set, i) => {
        rows.push([s.date, s.week, s.day, s.status, s.durationMin ?? '', e.key, e.performed, i + 1, set.load ?? '', set.reps ?? '', set.done ? 1 : 0, i === e.sets.length - 1 ? e.lastRpe ?? '' : '']);
      });
    }
  }
  return toCsv(['date', 'week', 'day', 'status', 'duration_min', 'exercise', 'performed', 'set', 'load_kg', 'reps', 'done', 'last_set_rpe'], rows);
}

export function foodCsv(logs: FoodLog[]): string {
  const rows = [...logs].filter((l) => !l.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.meal.localeCompare(b.meal))
    .map((l) => [l.date, l.meal, l.name, l.grams, l.servingLabel ?? '', l.servings ?? '', Math.round(l.macros.kcal), l.macros.protein.toFixed(1), l.macros.carbs.toFixed(1), l.macros.fat.toFixed(1)]);
  return toCsv(['date', 'meal', 'food', 'grams', 'serving', 'servings', 'kcal', 'protein_g', 'carbs_g', 'fat_g'], rows);
}

export function weightCsv(body: BodyLog[]): string {
  const rows = [...body].filter((b) => !b.deleted).sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => [b.id, b.weightKg ?? '', b.waistCm ?? '', b.steps ?? '']);
  return toCsv(['date', 'weight_kg', 'waist_cm', 'steps'], rows);
}
