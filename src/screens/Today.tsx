// The main screen: today's workout as a checklist.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  allowsFailure, amrapResult, buildHistory, exerciseTargetLoad, formatSets, getWeek, initialExercise,
  isAmrap, isBackOff, isLateCutWeek, lastOf, oneRmFor, parseRest, performanceDroppedTwice, performedName,
  progressionHint, substitutionsOf, today, topSetMissed, type HistoryEntry,
} from '../core';
import { fmt } from '../core/format';
import type { DayName, Lift, ProgramExercise, Session, SessionExercise, SetLog } from '../core/types';
import { Modal, NumInput, toast } from '../components/ui';
import { InstallBanner } from '../components/InstallBanner';
import { TodayBanners } from '../components/Banners';
import { newId } from '../db/db';
import { remove, save, saveSettings } from '../db/repo';
import { go, useRoute } from '../lib/router';
import { useApp } from '../lib/state';
import { askNotificationPermission, notificationsSupported, startTimer, unlockAudio } from '../lib/timer';
import { program } from '../program';
import { triggerSync } from '../lib/sync';

export function Today() {
  const app = useApp();
  const { sessions, settings, swaps, next } = app;
  const { query } = useRoute();

  // Which workout is shown: ?week=&day= (manual pick) → an unfinished session → the next one.
  const inProgress = sessions.find((s) => s.status === 'in_progress');
  const sel: { week: number; day: DayName } = query.week && query.day
    ? { week: Number(query.week), day: query.day as DayName }
    : inProgress ? { week: inProgress.week, day: inProgress.day } : { week: next.week, day: next.day };
  const manual = !!(query.week && query.day) && !(sel.week === next.week && sel.day === next.day);
  const selKey = `${sel.week}|${sel.day}`;

  const plan = getWeek(program, sel.week).days.find((d) => d.day === sel.day)!;
  const existing: Session | undefined =
    sessions.find((s) => s.week === sel.week && s.day === sel.day && s.status === 'in_progress') ??
    [...sessions].reverse().find((s) => s.week === sel.week && s.day === sel.day);
  const history = useMemo(() => buildHistory(sessions, existing?.id), [sessions, existing?.id]);

  // Local working copy of the exercises. It is the source of truth while you edit and is
  // saved to IndexedDB on every change (so nothing is lost if the phone kills the app).
  const build = (): SessionExercise[] =>
    plan.exercises.map((ex) => existing?.exercises.find((e) => e.key === ex.name) ?? initialExercise(ex, settings, swaps.get(ex.base_exercise), history));
  const [exs, setExs] = useState<SessionExercise[]>(build);
  const idRef = useRef<string>(existing?.id ?? newId());
  const startedRef = useRef<number | null>(existing?.startedAt ?? null);
  useEffect(() => {
    setExs(build());
    idRef.current = existing?.id ?? newId();
    startedRef.current = existing?.startedAt ?? null;
    // Only when you switch to another workout — not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const status = existing?.status ?? 'new';
  const [picker, setPicker] = useState(false);

  async function persist(nextExs: SessionExercise[]) {
    setExs(nextExs);
    startedRef.current ??= Date.now();
    await save('sessions', {
      id: idRef.current,
      week: sel.week, day: sel.day,
      date: existing?.date ?? today(),
      startedAt: startedRef.current,
      finishedAt: existing?.finishedAt ?? null,
      durationMin: existing?.durationMin ?? null,
      status: existing?.status ?? 'in_progress',
      exercises: nextExs,
    });
  }
  const updateEx = (i: number, se: SessionExercise) => persist(exs.map((e, j) => (j === i ? se : e)));

  async function finish() {
    const undone = exs.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
    if (undone > 0 && !confirm(`${undone} set(s) not ticked. Finish anyway?`)) return;
    const startedAt = startedRef.current ?? Date.now();
    const finishedAt = Date.now();
    await save('sessions', {
      id: idRef.current, week: sel.week, day: sel.day, date: existing?.date ?? today(),
      startedAt, finishedAt, durationMin: Math.round((finishedAt - startedAt) / 60000),
      status: 'done', exercises: exs,
    });
    toast(`${sel.day} done in ${Math.round((finishedAt - startedAt) / 60000)} min 💪`);
    triggerSync();
    go('/today');
  }

  async function discard() {
    if (!existing || !confirm('Discard this workout log?')) return;
    await remove('sessions', existing.id);
    go('/today');
  }

  async function swap(ex: ProgramExercise, substitute: string | null) {
    await save('swaps', { id: ex.base_exercise, substitute });
    // Update every variant of this exercise in the current session (only if nothing ticked yet).
    persist(exs.map((se, j) => {
      const pe = plan.exercises[j];
      if (pe.base_exercise !== ex.base_exercise || se.sets.some((s) => s.done)) return se;
      return initialExercise(pe, settings, substitute, history);
    }));
  }

  // ----- warnings from the rules -----
  const dropped = plan.exercises.filter((ex) => performanceDroppedTwice(history.get(performedName(ex, swaps.get(ex.base_exercise))) ?? []));
  const lateCut = isLateCutWeek(program, sel.week);
  const missedTop = lateCut ? plan.exercises.filter((ex, i) => topSetMissed(ex, exs[i]?.sets ?? [])).map((e) => e.base_exercise) : [];
  const canTrimAccessories = status !== 'done' && plan.exercises.some((ex, i) => !ex.is_primary && exs[i].sets.length > 1 && !exs[i].sets[exs[i].sets.length - 1].done);

  function trimAccessories() {
    persist(exs.map((se, i) => {
      const ex = plan.exercises[i];
      if (ex.is_primary || se.sets.length <= 1 || se.sets[se.sets.length - 1].done) return se;
      return { ...se, sets: se.sets.slice(0, -1) };
    }));
    toast('Removed 1 set from each accessory');
  }

  const doneSets = exs.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = exs.reduce((n, e) => n + e.sets.length, 0);

  return (
    <>
      <InstallBanner />
      <TodayBanners />

      <div class="row between">
        <div>
          <h1 style={{ marginBottom: 0 }}>{sel.day}</h1>
          <div class="muted small">
            Week {sel.week} · {status === 'done' ? `✅ done ${existing?.date}${existing?.durationMin ? ` · ${existing.durationMin} min` : ''}` : status === 'in_progress' ? `in progress · ${doneSets}/${totalSets} sets` : 'not started'}
            {manual && <> · <a href="#/today" style={{ color: 'var(--accent)' }}>back to next workout</a></>}
          </div>
        </div>
        <button class="small" onClick={() => setPicker(true)}>Change</button>
      </div>

      {next.programComplete && !manual && <div class="card info">🎉 All 20 weeks done! You can still open any day with “Change”.</div>}

      <NotificationPrompt />

      {dropped.length > 0 && (
        <div class="card warn">
          <b>Recovery check</b>
          <p class="small">{dropped.map((e) => e.base_exercise).join(', ')}: performance dropped two sessions in a row. {program.rules.recovery_rule}</p>
          {canTrimAccessories && <button class="small" onClick={trimAccessories}>Remove 1 set from each accessory</button>}
        </div>
      )}
      {missedTop.length > 0 && (
        <div class="card warn">
          <b>Late-cut rule</b>
          <p class="small">Top set missed its rep target ({missedTop.join(', ')}). {program.rules.late_cut_rule}</p>
        </div>
      )}

      {plan.exercises.map((ex, i) => (
        <ExerciseCard
          key={selKey + ex.name}
          ex={ex}
          se={exs[i]}
          week={sel.week}
          last={lastOf(history, exs[i].performed)}
          swapped={swaps.get(ex.base_exercise) ?? null}
          skipHint={lateCut && isBackOff(ex) && missedTop.includes(ex.base_exercise)}
          onChange={(se) => updateEx(i, se)}
          onSwap={(s) => swap(ex, s)}
        />
      ))}

      <div class="stack" style={{ marginTop: 16 }}>
        {status !== 'done' && <button class="success block" onClick={finish}>Finish workout</button>}
        {existing && status !== 'done' && <button class="danger block" onClick={discard}>Discard workout</button>}
      </div>

      {picker && <DayPicker current={sel} onClose={() => setPicker(false)} />}
    </>
  );
}

function NotificationPrompt() {
  const [perm, setPerm] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  if (perm !== 'default') return null;
  return (
    <div class="banner row between">
      <span class="small">🔔 Get a notification when rest is over?</span>
      <button class="small" onClick={async () => setPerm(await askNotificationPermission())}>Enable</button>
    </div>
  );
}

function DayPicker({ current, onClose }: { current: { week: number; day: DayName }; onClose: () => void }) {
  const { sessions, next } = useApp();
  const [week, setWeek] = useState(current.week);
  const done = (w: number, d: DayName) => sessions.some((s) => s.week === w && s.day === d && s.status === 'done');
  return (
    <Modal title="Pick a workout" onClose={onClose}>
      <label>Week</label>
      <select value={week} onChange={(e) => setWeek(Number((e.target as HTMLSelectElement).value))}>
        {program.weeks.map((w) => (
          <option key={w.week} value={w.week}>Week {w.week} — {w.phase}{w.week === next.week ? ' (current)' : ''}</option>
        ))}
      </select>
      <label>Day</label>
      <div class="stack">
        {program.day_order.map((d) => (
          <button key={d} class={`block ${d === current.day && week === current.week ? 'primary' : ''}`}
            onClick={() => { go('/today', { week, day: d }); onClose(); }}>
            {done(week, d) ? '✅ ' : ''}{d}{week === next.week && d === next.day ? ' — next' : ''}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function ExerciseCard(props: {
  ex: ProgramExercise; se: SessionExercise; week: number; last: HistoryEntry | null; swapped: string | null;
  skipHint: boolean; onChange: (se: SessionExercise) => void; onSwap: (s: string | null) => void;
}) {
  const { ex, se, last, week } = props;
  const { settings } = useApp();
  const [showSubs, setShowSubs] = useState(false);
  const target = exerciseTargetLoad(ex, settings);
  const rm = oneRmFor(ex, settings);
  const allDone = se.sets.length > 0 && se.sets.every((s) => s.done);
  const hint = progressionHint(ex, last, program.rules.load_rounding_kg);
  const restSec = parseRest(ex.rest)[0];
  const subs = substitutionsOf(ex);

  const setSet = (i: number, patch: Partial<SetLog>) =>
    props.onChange({ ...se, sets: se.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  function toggle(i: number) {
    unlockAudio(); // this tap lets iOS play the end-of-rest sound later
    const done = !se.sets[i].done;
    setSet(i, { done });
    if (done) startTimer(restSec, nextLabel(i));
  }
  const nextLabel = (i: number) => (i + 1 < se.sets.length ? `${se.performed} — set ${i + 2}` : 'next exercise');

  return (
    <section class={`card ${allDone ? 'done' : ''}`}>
      <div class="row between" style={{ alignItems: 'flex-start' }}>
        <div class="grow">
          <h3>{allDone ? '✅ ' : ''}{se.performed}</h3>
          {props.swapped && <div class="small muted">swapped from {ex.name}</div>}
        </div>
        <span class="pill nowrap">{ex.sets} × {ex.reps}</span>
      </div>

      <div class="small muted" style={{ marginTop: 4 }}>
        {ex.early_rpe && <>RPE {ex.early_rpe.replace(/^~/, '~')} → </>}
        {ex.last_set_rpe && <>last set {ex.last_set_rpe}</>}
        {(ex.early_rpe || ex.last_set_rpe) && ' · '}rest {ex.rest}
        {ex.warmup_sets && <> · warm-up {ex.warmup_sets}</>}
      </div>

      {target != null && (
        <div style={{ marginTop: 6 }}>
          <span class="target">{target} kg</span>
          <span class="muted small"> = {Math.round((ex.percent_1rm ?? 0) * 1000) / 10}% of {rm} kg{ex.one_rm_source === 'after_week10_amrap' ? ' (post-AMRAP 1RM)' : ''}</span>
        </div>
      )}

      {allowsFailure(ex.last_set_rpe) && <p class="small" style={{ color: 'var(--amber)' }}>* {program.rules.failure_note}</p>}
      <p class="cue">{ex.cue}</p>

      {subs.length > 0 && (
        <div>
          <button class="ghost small" onClick={() => setShowSubs(!showSubs)}>⇄ Substitutions</button>
          {showSubs && (
            <div class="chips">
              <button class={`chip ${!props.swapped ? 'on' : ''}`} onClick={() => props.onSwap(null)}>{ex.base_exercise}</button>
              {subs.map((s) => (
                <button key={s} class={`chip ${props.swapped === s ? 'on' : ''}`} onClick={() => props.onSwap(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {props.skipHint && <p class="small" style={{ color: 'var(--amber)' }}>⚠ Top set missed — consider skipping these back-off sets today.</p>}

      <div class="set-head" style={{ marginTop: 8 }}><span>#</span><span>kg</span><span>reps</span><span>done</span></div>
      {se.sets.map((s, i) => (
        <div class="set-row" key={i}>
          <span class="n">{i + 1}</span>
          <NumInput value={s.load} onChange={(v) => setSet(i, { load: v })} placeholder="kg" />
          <NumInput kind="numeric" value={s.reps} onChange={(v) => setSet(i, { reps: v })} placeholder={isAmrap(ex) ? 'AMRAP' : 'reps'} />
          <button class={`check ${s.done ? 'on' : ''}`} onClick={() => toggle(i)} aria-label={`Set ${i + 1} done`} aria-pressed={s.done}>✓</button>
        </div>
      ))}

      <div class="row" style={{ marginTop: 8 }}>
        <label class="grow" style={{ margin: 0 }}>Last-set actual RPE</label>
        <div style={{ width: 90 }}>
          <NumInput value={se.lastRpe} onChange={(v) => props.onChange({ ...se, lastRpe: v })} placeholder="RPE" />
        </div>
      </div>

      {last && <p class="small muted">Last time ({last.date}): {formatSets(last.sets) || '—'}{last.lastRpe != null ? ` @ RPE ${fmt(last.lastRpe)}` : ''}</p>}
      {hint && <p class="hint">↗ {hint.text}</p>}

      {isAmrap(ex) && <AmrapPanel ex={ex} se={se} week={week} />}
    </section>
  );
}

/** Week 10 / 20 AMRAP: Epley → new 1RM, old vs new, confirm to apply to weeks 11-20. */
function AmrapPanel({ ex, se, week }: { ex: ProgramExercise; se: SessionExercise; week: number }) {
  const { settings } = useApp();
  const lift = ex.base_exercise as Lift;
  const s = se.sets.find((x) => x.done && x.load && x.reps) ?? se.sets.find((x) => x.load && x.reps);
  if (!s?.load || !s.reps) return <p class="small muted">Enter the load and the reps you got — the new 1RM is calculated with Epley.</p>;
  const old = oneRmFor(ex, settings) ?? 0;
  const r = amrapResult(old, s.load, s.reps, program.rules.load_rounding_kg);
  const applied = week <= 10 ? settings.oneRmAfter10[lift] === r.newOneRm : false;

  async function apply() {
    if (week <= 10) {
      await saveSettings({ oneRmAfter10: { ...settings.oneRmAfter10, [lift]: r.newOneRm } });
    }
    await save('oneRmHistory', { date: today(), lift, oldOneRm: r.oldOneRm, newOneRm: r.newOneRm, load: s!.load!, reps: s!.reps! });
    toast(week <= 10 ? `${lift}: weeks 11–20 now use ${r.newOneRm} kg` : `${lift}: final 1RM ${r.newOneRm} kg saved`);
  }

  return (
    <div class="card info" style={{ margin: '10px 0 0' }}>
      <div class="small muted">AMRAP result (Epley: {s.load} × (1 + {s.reps}/30))</div>
      <div class="row between">
        <span>Old 1RM <b>{r.oldOneRm} kg</b></span>
        <span>→ New <b style={{ fontSize: 20 }}>{r.newOneRm} kg</b></span>
        <span style={{ color: r.change >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.change >= 0 ? '+' : ''}{r.change}</span>
      </div>
      {applied ? <p class="small">✅ Applied to weeks 11–20.</p> : (
        <button class="primary block small" style={{ marginTop: 8 }} onClick={apply}>
          {week <= 10 ? 'Apply new 1RM to weeks 11–20' : 'Save as final 1RM'}
        </button>
      )}
    </div>
  );
}
