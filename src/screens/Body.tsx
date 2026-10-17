// Morning weight (daily), waist (weekly) and the weekly check-in with adjust advice.
import { useState } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { adjustAdvice, checkinRows, isMaintenanceWeek, programWeekOn, today, trailingCutLosses, calendarWeekRange } from '../core';
import { fmt } from '../core/format';
import { RecalcPrompt } from '../components/Banners';
import { Field, NumInput, toast } from '../components/ui';
import { db } from '../db/db';
import { alive, saveSettings } from '../db/repo';
import { useApp } from '../lib/state';
import { program } from '../program';
import { saveBody } from './Cardio';

export function BodyInputs({ date }: { date: string }) {
  const body = useLiveQuery(() => db.bodyLogs.get(date), [date]);
  const cur = body && !body.deleted ? body : null;
  const [w, setW] = useState<number | null>(null);
  const [waist, setWaist] = useState<number | null>(null);
  return (
    <div class="grid2">
      <Field label="Morning weight (kg)">
        <div class="row">
          <NumInput value={w ?? cur?.weightKg ?? null} onChange={setW} />
          <button class="primary small" disabled={w == null} onClick={async () => { await saveBody(date, { weightKg: w }); setW(null); toast('Weight saved'); }}>✓</button>
        </div>
      </Field>
      <Field label="Waist (cm, weekly)">
        <div class="row">
          <NumInput value={waist ?? cur?.waistCm ?? null} onChange={setWaist} />
          <button class="primary small" disabled={waist == null} onClick={async () => { await saveBody(date, { waistCm: waist }); setWaist(null); toast('Waist saved'); }}>✓</button>
        </div>
      </Field>
    </div>
  );
}

export function BodyScreen() {
  const { settings, sessions, weekInfo } = useApp();
  const [date, setDate] = useState(today());
  const body = useLiveQuery(() => db.bodyLogs.toArray().then(alive), []);
  if (!body) return null;

  const weights = body.filter((b) => b.weightKg != null).map((b) => ({ date: b.id, value: b.weightKg! }));
  const waists = body.filter((b) => b.waistCm != null).map((b) => ({ date: b.id, value: b.waistCm! }));
  // A calendar week counts as "cut" if the program week on its last day was a cut week.
  const isCut = (w: number) => !isMaintenanceWeek(program, programWeekOn(program, sessions, calendarWeekRange(settings.startDate, w)[1]));
  const rows = checkinRows(settings.startDate, today(), weights, waists, isCut);
  const advice = weekInfo.calories === 'cut' ? adjustAdvice(program, trailingCutLosses(rows)) : [];
  const [lo, hi] = program.nutrition.target_weekly_loss_pct;

  return (
    <>
      <h1>Body & check-in</h1>
      <RecalcPrompt />
      <Field label="Date"><input type="date" value={date} max={today()} onInput={(e) => setDate((e.target as HTMLInputElement).value || today())} /></Field>
      <BodyInputs date={date} />

      <h2>Weekly check-in</h2>
      <p class="small muted">Target loss: {lo}–{hi}% of bodyweight per week on cut weeks. Advice only appears during cut weeks.</p>
      {advice.map((a) => (
        <div class="card warn" key={a.text}>
          <b>Suggestion:</b> {a.advice}
          <div class="small muted">Rule: {a.text}</div>
          {/-150 kcal/.test(a.advice) && (
            <div class="row wrap" style={{ marginTop: 8 }}>
              <button class="small" onClick={() => saveSettings({ kcalAdjust: (settings.kcalAdjust || 0) - 150 })}>Apply −150 kcal</button>
              <button class="small" onClick={() => saveSettings({ stepsAdjust: (settings.stepsAdjust || 0) + 2000 })}>Apply +2,000 steps</button>
            </div>
          )}
          {/\+100/.test(a.advice) && (
            <div class="row wrap" style={{ marginTop: 8 }}>
              <button class="small" onClick={() => saveSettings({ kcalAdjust: (settings.kcalAdjust || 0) + 100 })}>Apply +100 kcal</button>
              <button class="small" onClick={() => saveSettings({ kcalAdjust: (settings.kcalAdjust || 0) + 150 })}>Apply +150 kcal</button>
            </div>
          )}
        </div>
      ))}
      {(settings.kcalAdjust || settings.stepsAdjust) ? <p class="small muted">Current adjustments: {settings.kcalAdjust || 0} kcal, {settings.stepsAdjust || 0} steps/day (edit in Settings).</p> : null}

      <div class="card" style={{ padding: '6px 12px' }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead><tr class="muted small"><th class="center">Wk</th><th class="right">Avg kg</th><th class="right">Change</th><th class="right">Waist</th><th class="right">Phase</th></tr></thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.week} style={{ borderTop: '1px solid var(--border)', height: 40 }}>
                <td class="center">{r.week}{r.complete ? '' : '*'}</td>
                <td class="right">{fmt(r.avg, 1)}</td>
                <td class="right" style={{ color: r.lossPct == null ? undefined : r.lossPct >= lo && r.lossPct <= 1 ? 'var(--green)' : 'var(--amber)' }}>
                  {r.lossPct == null ? '–' : `${r.lossPct > 0 ? '−' : '+'}${fmt(Math.abs(r.lossPct), 2)}%`}
                </td>
                <td class="right">{fmt(r.waist, 1)}</td>
                <td class="right small muted">{r.cut ? 'cut' : 'maint.'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="small muted">* week in progress. Weeks are 7-day blocks from your start date ({settings.startDate}).</p>
      </div>
    </>
  );
}
