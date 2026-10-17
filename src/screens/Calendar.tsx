// Month calendar with a tick per goal for each day, streaks, and the editable day log.
import { useState } from 'preact/hooks';
import { addDays, bestStreak, currentStreak, datesBetween, dayTicks, today, toISODate, TICK_LABELS, type DayTicks } from '../core';
import { fmtInt } from '../core/format';
import { useDayIndex } from '../lib/daily';
import { go, useRoute } from '../lib/router';
import { useApp } from '../lib/state';
import { FoodDayView } from './FoodDay';
import { BodyInputs } from './Body';
import { CardioLogger, StepsInput } from './Cardio';

const TICK_KEYS = Object.keys(TICK_LABELS) as (keyof DayTicks)[];
const TICK_ICONS: Record<keyof DayTicks, string> = { workout: '🏋', calories: '🔥', protein: '🥩', steps: '👣', cardio: '🚴', weight: '⚖' };

export function CalendarScreen() {
  const { settings } = useApp();
  const idx = useDayIndex();
  const [month, setMonth] = useState(() => today().slice(0, 7)); // "YYYY-MM"
  if (!idx) return null;

  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = toISODate(new Date(y, m, 0));
  // Grid starts on Saturday (common week start in Egypt).
  const lead = (new Date(y, m - 1, 1).getDay() + 1) % 7;
  const cells = [...Array(lead).fill(null), ...datesBetween(first, last)];
  const ticks = (d: string) => dayTicks(idx.data(d), idx.targets(d));
  const allDays = datesBetween(settings.startDate < first ? settings.startDate : first, today());
  const t = today();

  const streak = (k: keyof DayTicks) => ({ cur: currentStreak(t, (d) => d >= settings.startDate && ticks(d)[k]), best: bestStreak(allDays, (d) => ticks(d)[k]) });
  const protein = streak('protein');
  const steps = streak('steps');
  const shiftMonth = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(toISODate(d).slice(0, 7)); };

  return (
    <>
      <div class="grid2">
        <div class="card center"><div class="small muted">🥩 Protein streak</div><div class="big-num">{protein.cur}</div><div class="small muted">best {protein.best}</div></div>
        <div class="card center"><div class="small muted">👣 Steps streak</div><div class="big-num">{steps.cur}</div><div class="small muted">best {steps.best}</div></div>
      </div>

      <div class="row between">
        <button class="small" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
        <h2 style={{ margin: 0 }}>{new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <button class="small" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
      </div>

      <div class="cal" style={{ marginTop: 10 }}>
        {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => <div class="dow" key={d}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const tk = ticks(d);
          const future = d > t;
          return (
            <div key={d} class={`day ${d === t ? 'today' : ''} ${future || d < settings.startDate ? 'out' : ''}`} onClick={() => !future && go('/day', { date: d })}>
              <span>{Number(d.slice(8))}</span>
              <div class="ticks">{TICK_KEYS.map((k) => <span key={k} class={`dot ${tk[k] ? 'on' : ''}`} />)}</div>
            </div>
          );
        })}
      </div>
      {/* Legend laid out in the same 3×2 grid as the dots in each day */}
      <div class="legend" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {TICK_KEYS.map((k) => <span key={k}>{TICK_ICONS[k]} {TICK_LABELS[k]}</span>)}
      </div>
      <p class="small muted">Each day's dots follow the legend's layout. Green = done. Tap a day to see and edit it.</p>
    </>
  );
}

export function DayDetail() {
  const { query } = useRoute();
  const { sessions } = useApp();
  const idx = useDayIndex();
  const date = query.date || today();
  if (!idx) return null;
  const tk = dayTicks(idx.data(date), idx.targets(date));
  const target = idx.targets(date);
  const daySessions = sessions.filter((s) => s.date === date);
  const steps = idx.data(date).steps;

  return (
    <>
      <div class="row between">
        <button class="small" onClick={() => go('/day', { date: addDays(date, -1) })}>‹</button>
        <h1 style={{ margin: 0 }}>{new Date(date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</h1>
        <button class="small" disabled={date >= today()} onClick={() => go('/day', { date: addDays(date, 1) })}>›</button>
      </div>
      <div class="chips" style={{ justifyContent: 'center', marginTop: 8 }}>
        {TICK_KEYS.map((k) => <span key={k} class={`chip ${tk[k] ? 'on' : ''}`}>{tk[k] ? '✓' : '·'} {TICK_LABELS[k]}</span>)}
      </div>

      <h2>Workout</h2>
      {daySessions.length === 0 ? <p class="small muted">No workout logged.</p> : daySessions.map((s) => (
        <a key={s.id} class="btn block" href={`#/today?week=${s.week}&day=${encodeURIComponent(s.day)}`}>
          {s.status === 'done' ? '✅' : '⏳'} Week {s.week} {s.day}{s.durationMin ? ` · ${s.durationMin} min` : ''} — open
        </a>
      ))}

      <h2>Body</h2>
      <BodyInputs date={date} />

      <h2>Steps <span class="small muted">({steps != null ? fmtInt(steps) : '–'} / {fmtInt(target.steps)})</span></h2>
      <StepsInput date={date} />

      <h2>Cardio</h2>
      <CardioLogger date={date} />

      <h2>Food</h2>
      <FoodDayView date={date} embedded />
      <a class="btn block" href={`#/food?date=${date}`}>Open food log for this day</a>
    </>
  );
}
