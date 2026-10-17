// Steps and cardio sessions, with this week's targets from program.json → cardio_plan.
import { useState } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { calendarWeek, calendarWeekRange, cardioPlanFor, cardioProgress, datesBetween, intervalsWarning, today } from '../core';
import { fmtInt } from '../core/format';
import type { BodyLog, CardioLog, CardioType } from '../core/types';
import { Bar, Field, NumInput, toast } from '../components/ui';
import { db } from '../db/db';
import { alive, remove, save } from '../db/repo';
import { useApp } from '../lib/state';
import { program } from '../program';

export const CARDIO_TYPES: { id: CardioType; label: string }[] = [
  { id: 'incline_walk', label: 'Incline walk' }, { id: 'bike', label: 'Bike' },
  { id: 'intervals', label: 'Intervals' }, { id: 'other', label: 'Other' },
];
const typeLabel = (t: CardioType) => CARDIO_TYPES.find((x) => x.id === t)?.label ?? t;

/** Saves a field of the day's body log (steps / weight / waist), merging with what's there. */
export async function saveBody(date: string, patch: Partial<BodyLog>) {
  const cur = await db.bodyLogs.get(date);
  await save('bodyLogs', { ...(cur && !cur.deleted ? cur : {}), ...patch, id: date, deleted: false });
}

export function StepsInput({ date }: { date: string }) {
  const body = useLiveQuery(() => db.bodyLogs.get(date), [date]);
  const [v, setV] = useState<number | null>(null);
  const current = body && !body.deleted ? body.steps ?? null : null;
  return (
    <div class="row">
      <NumInput kind="numeric" value={v ?? current} onChange={setV} placeholder="steps" />
      <button class="primary" disabled={v == null} onClick={async () => { await saveBody(date, { steps: v }); setV(null); toast('Steps saved'); }}>Save</button>
    </div>
  );
}

export function CardioLogger({ date }: { date: string }) {
  const { next } = useApp();
  const [type, setType] = useState<CardioType>('incline_walk');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [hr, setHr] = useState<number | null>(null);
  const logs = useLiveQuery(() => db.cardio.where('date').equals(date).toArray().then(alive), [date]);
  const warning = date === today() ? intervalsWarning(type, next.day) : null;

  async function add() {
    if (!minutes) return;
    await save('cardio', { date, type, minutes, avgHr: hr });
    toast('Cardio logged');
    setHr(null);
  }

  return (
    <div>
      <div class="seg">{CARDIO_TYPES.map((t) => <button key={t.id} class={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>{t.label}</button>)}</div>
      {warning && <div class="card warn small">⚠ {warning}</div>}
      <div class="grid2">
        <Field label="Minutes"><NumInput kind="numeric" value={minutes} onChange={setMinutes} /></Field>
        <Field label="Avg heart rate (optional)"><NumInput kind="numeric" value={hr} onChange={setHr} placeholder="bpm" /></Field>
      </div>
      <button class="primary block" style={{ marginTop: 10 }} disabled={!minutes} onClick={add}>Add session</button>
      {logs && logs.length > 0 && (
        <ul class="list">
          {logs.map((c: CardioLog) => (
            <li key={c.id}>
              <span class="grow">{typeLabel(c.type)} · {c.minutes} min{c.avgHr ? ` · ${c.avgHr} bpm` : ''}</span>
              <button class="ghost small" onClick={() => remove('cardio', c.id)} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CardioScreen() {
  const { settings, week } = useApp();
  const [date, setDate] = useState(today());
  const plan = cardioPlanFor(program, week);
  const calWeek = Math.max(1, calendarWeek(settings.startDate, today()));
  const [from, to] = calendarWeekRange(settings.startDate, calWeek);
  const weekData = useLiveQuery(async () => ({
    body: alive(await db.bodyLogs.where('id').between(from, to, true, true).toArray()),
    cardio: alive(await db.cardio.where('date').between(from, to, true, true).toArray()),
  }), [from, to]);
  const steps = datesBetween(from, to).map((d) => weekData?.body.find((b) => b.id === d)?.steps ?? null);
  const p = cardioProgress(plan, steps, weekData?.cardio ?? [], settings.stepsAdjust);

  return (
    <>
      <h1>Cardio & steps</h1>
      <div class="card">
        <div class="small muted">This week ({from} → {to}) · plan for program week {week}</div>
        <div class="macro">
          <div class="row between small"><span>Steps avg</span><span><b>{fmtInt(p.stepsAvg)}</b> / {fmtInt(p.stepsTarget)} ({p.stepsDays} days logged)</span></div>
          <Bar value={p.stepsAvg} max={p.stepsTarget} status={p.stepsAvg >= p.stepsTarget ? 'green' : 'blue'} />
        </div>
        <div class="macro">
          <div class="row between small"><span>LISS ({p.lissMinutes} min)</span><span><b>{p.lissDone}</b> / {p.lissTarget} sessions</span></div>
          <Bar value={p.lissDone} max={p.lissTarget} status={p.lissDone >= p.lissTarget ? 'green' : 'blue'} />
        </div>
        {p.intervalsOptional > 0 && <div class="small">Intervals (optional): {p.intervalsDone} / {p.intervalsOptional}</div>}
        {p.note && <div class="small muted">Note: {p.note}</div>}
        <div class="small muted">{program.weeks.find((w) => w.week === week)?.cardio}</div>
      </div>

      <Field label="Date"><input type="date" value={date} max={today()} onInput={(e) => setDate((e.target as HTMLInputElement).value || today())} /></Field>
      <h2>Steps</h2>
      <StepsInput date={date} />
      <h2>Cardio session</h2>
      <CardioLogger date={date} />
    </>
  );
}
