// First-run setup and the Settings page (same form, different defaults).
import { useState } from 'preact/hooks';
import { today } from '../core/dates';
import { maintenanceKcal, nutritionFactors, targetsForWeek } from '../core/nutrition';
import type { Lift, Settings } from '../core/types';
import { Field, NumInput, toast } from '../components/ui';
import { save, saveSettings } from '../db/repo';
import { program } from '../program';

const LIFTS = program.primary_lifts;

export function defaultSettings(): Settings {
  return {
    id: 'me', updatedAt: 0, startDate: today(), bodyweightKg: 0, maintenanceOverride: null,
    kcalAdjust: 0, stepsAdjust: 0,
    oneRm: Object.fromEntries(LIFTS.map((l) => [l, 0])) as Record<Lift, number>,
    oneRmAfter10: {}, week11RecalcDone: false, syncUrl: '', syncToken: '',
  };
}

export function SettingsForm({ initial, firstRun }: { initial: Settings; firstRun: boolean }) {
  const [s, setS] = useState<Settings>(initial);
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const setRm = (lift: Lift, v: number | null) => set({ oneRm: { ...s.oneRm, [lift]: v ?? 0 } });
  const setRm10 = (lift: Lift, v: number | null) => {
    const next = { ...s.oneRmAfter10 };
    if (v) next[lift] = v; else delete next[lift];
    set({ oneRmAfter10: next });
  };

  const valid = s.bodyweightKg > 20 && LIFTS.every((l) => s.oneRm[l] > 0) && !!s.startDate;
  const cut = valid ? targetsForWeek(program, s, 1) : null;
  const maint = valid ? maintenanceKcal(program, s.bodyweightKg, s.maintenanceOverride) : null;

  async function submit() {
    if (!valid) return;
    await saveSettings(s);
    if (firstRun) {
      // Log the starting bodyweight so the weight chart has a first point.
      await save('bodyLogs', { id: today(), weightKg: s.bodyweightKg });
    }
    toast('Saved');
  }

  return (
    <div class="stack">
      <Field label="Program start date">
        <input type="date" value={s.startDate} onInput={(e) => set({ startDate: (e.target as HTMLInputElement).value })} />
      </Field>
      <Field label="Bodyweight (kg)" hint="Used for protein, fat and calorie targets.">
        <NumInput value={s.bodyweightKg || null} onChange={(v) => set({ bodyweightKg: v ?? 0 })} placeholder="e.g. 88.5" />
      </Field>

      <h2>Current 1RMs (kg)</h2>
      <div class="grid2">
        {LIFTS.map((l) => (
          <Field key={l} label={l}>
            <NumInput value={s.oneRm[l] || null} onChange={(v) => setRm(l, v)} />
          </Field>
        ))}
      </div>

      {!firstRun && (
        <>
          <h2>1RMs for weeks 11–20</h2>
          <p class="small muted">Set automatically by the Week 10 AMRAP. Empty = use the current 1RM. Overhead Press has no AMRAP, so edit it here if you like.</p>
          <div class="grid2">
            {LIFTS.map((l) => (
              <Field key={l} label={l}>
                <NumInput value={s.oneRmAfter10[l] ?? null} onChange={(v) => setRm10(l, v)} placeholder={String(s.oneRm[l] || '')} />
              </Field>
            ))}
          </div>
        </>
      )}

      <h2>Calories</h2>
      <Field label="Maintenance kcal override (optional)" hint={`Default: bodyweight × ${nutritionFactors(program).maintPerKg}`}>
        <NumInput kind="numeric" value={s.maintenanceOverride} onChange={(v) => set({ maintenanceOverride: v && v > 0 ? v : null })} placeholder="leave empty" />
      </Field>
      {!firstRun && (
        <div class="grid2">
          <Field label="Cut kcal adjustment" hint="From check-in advice, e.g. -150">
            <NumInput kind="numeric" value={s.kcalAdjust || null} onChange={(v) => set({ kcalAdjust: v ?? 0 })} placeholder="0" />
          </Field>
          <Field label="Steps target adjustment" hint="e.g. +2000">
            <NumInput kind="numeric" value={s.stepsAdjust || null} onChange={(v) => set({ stepsAdjust: v ?? 0 })} placeholder="0" />
          </Field>
        </div>
      )}

      {cut && (
        <div class="card info">
          <div class="small muted">Your targets</div>
          <div>Maintenance: <b>{maint}</b> kcal (weeks {program.nutrition.maintenance_weeks.join(', ')})</div>
          <div>Cut: <b>{cut.kcal}</b> kcal</div>
          <div>Protein {cut.protein} g · Fat {cut.fat} g · Carbs {cut.carbs} g (cut weeks)</div>
        </div>
      )}

      <button class="primary block" disabled={!valid} onClick={submit}>{firstRun ? 'Start my program' : 'Save settings'}</button>
    </div>
  );
}

export function Setup() {
  return (
    <main class="screen" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1>💪 {program.name}</h1>
      <p class="muted">Quick setup. Everything stays on this phone and can be changed later in Settings.</p>
      <SettingsForm initial={defaultSettings()} firstRun />
    </main>
  );
}
