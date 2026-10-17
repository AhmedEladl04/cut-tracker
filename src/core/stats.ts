// Averages, streaks and other numbers for the dashboard and calendar.
import { addDays, calendarWeek } from './dates';
import type { Session } from './types';

export interface DatedValue { date: string; value: number }

/** Trailing 7-day average for each date that has a value (uses values in [d-6, d]). */
export function movingAverage7(points: DatedValue[]): DatedValue[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const from = addDays(p.date, -6);
    const win = sorted.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, value: Number((win.reduce((s, q) => s + q.value, 0) / win.length).toFixed(2)) };
  });
}

/** Average value per calendar week (7-day blocks from the start date). */
export function weeklyAverages(startDate: string, points: DatedValue[]): Map<number, number> {
  const groups = new Map<number, number[]>();
  for (const p of points) {
    const w = calendarWeek(startDate, p.date);
    groups.set(w, [...(groups.get(w) ?? []), p.value]);
  }
  const out = new Map<number, number>();
  for (const [w, vals] of [...groups].sort((a, b) => a[0] - b[0])) {
    out.set(w, Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)));
  }
  return out;
}

/** % change from previous to current (negative = went down). */
export function pctChange(prev: number, cur: number): number {
  return Number((((cur - prev) / prev) * 100).toFixed(2));
}

/**
 * Streak of consecutive days where `hit(date)` is true, ending today. Today counts only
 * if already hit (so an unfinished today doesn't break yesterday's streak).
 */
export function currentStreak(todayDate: string, hit: (date: string) => boolean): number {
  let d = hit(todayDate) ? todayDate : addDays(todayDate, -1);
  let n = 0;
  while (hit(d) && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak(dates: string[], hit: (date: string) => boolean): number {
  let best = 0, run = 0;
  for (const d of [...dates].sort()) {
    run = hit(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Done sets per program week (training volume). */
export function weeklySetVolume(sessions: Pick<Session, 'week' | 'status' | 'deleted' | 'exercises'>[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of sessions) {
    if (s.deleted || s.status !== 'done') continue;
    const n = s.exercises.reduce((acc, e) => acc + e.sets.filter((x) => x.done).length, 0);
    out.set(s.week, (out.get(s.week) ?? 0) + n);
  }
  return out;
}

/** Whole days since a timestamp (null → null). */
export function daysSince(ts: number | null | undefined, nowTs: number): number | null {
  if (!ts) return null;
  return Math.floor((nowTs - ts) / 86_400_000);
}

export const BACKUP_REMIND_DAYS = 7;
export const backupOverdue = (days: number | null) => days == null || days > BACKUP_REMIND_DAYS;

