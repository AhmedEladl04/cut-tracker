// Reminders shown at the top of Today: backup overdue, Week 11 recalculation.
import { useLiveQuery } from 'dexie-react-hooks';
import { backupOverdue, daysSince, movingAverage7, targetsForWeek } from '../core';
import { fmt } from '../core/format';
import { db } from '../db/db';
import { saveSettings } from '../db/repo';
import { useApp } from '../lib/state';
import { program } from '../program';

export function useLastBackup(): number | null | undefined {
  return useLiveQuery(() => db.meta.get('lastBackupAt').then((m) => (m?.value as number | undefined) ?? null), []);
}

export function BackupReminder() {
  const last = useLastBackup();
  if (last === undefined) return null;
  const days = daysSince(last, Date.now());
  if (!backupOverdue(days)) return null;
  return (
    <a href="#/backup" class="banner row between" style={{ color: 'var(--text)', textDecoration: 'none' }}>
      <span class="small">💾 {days == null ? 'No backup yet.' : `Last backup ${days} days ago.`} Your data only lives on this phone.</span>
      <span class="pill">Back up</span>
    </a>
  );
}

/** nutrition.recalculate_at_week: prompt to update bodyweight → new calorie targets. */
export function RecalcPrompt() {
  const { settings, week } = useApp();
  const weights = useLiveQuery(() => db.bodyLogs.filter((b) => !b.deleted && b.weightKg != null).toArray(), []);
  if (week < program.nutrition.recalculate_at_week || settings.week11RecalcDone || !weights) return null;
  const ma = movingAverage7(weights.map((w) => ({ date: w.id, value: w.weightKg! })));
  const avg = ma.length ? ma[ma.length - 1].value : null;
  const preview = avg ? targetsForWeek(program, { ...settings, bodyweightKg: avg }, week) : null;
  return (
    <div class="card info">
      <b>Week {program.nutrition.recalculate_at_week}: recalculate calories</b>
      <p class="small">Your targets still use {fmt(settings.bodyweightKg)} kg.
        {avg ? ` Your 7-day average is ${fmt(avg)} kg → ${preview!.kcal} kcal, ${preview!.protein} g protein.` : ' Log your morning weight to get a 7-day average.'}</p>
      <div class="row">
        {avg && <button class="primary small" onClick={() => saveSettings({ bodyweightKg: avg, week11RecalcDone: true })}>Use {fmt(avg)} kg</button>}
        <a class="btn small" href="#/settings">Edit manually</a>
        <button class="ghost small" onClick={() => saveSettings({ week11RecalcDone: true })}>Dismiss</button>
      </div>
    </div>
  );
}

export function TodayBanners() {
  return (
    <>
      <BackupReminder />
      <RecalcPrompt />
    </>
  );
}
