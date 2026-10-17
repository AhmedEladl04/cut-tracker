// Progress dashboard: weight trend, weekly calories, estimated 1RMs, steps and volume.
import { useMemo } from 'preact/hooks';
import type { ChartConfiguration } from 'chart.js';
import { bestE1rm, calendarWeek, calendarWeekRange, cardioPlanFor, movingAverage7, programWeekOn, targetsForWeek, today, weeklySetVolume } from '../core';
import { fmt, fmtInt } from '../core/format';
import { baseOptions, ChartCard, INK, SERIES } from '../components/ChartCard';
import { useAllLogs } from '../lib/daily';
import { useApp } from '../lib/state';
import { program } from '../program';

const shortDate = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

export function Progress() {
  const { settings, sessions, week } = useApp();
  const logs = useAllLogs();

  const charts = useMemo(() => {
    if (!logs) return null;
    const start = settings.startDate;
    const lastWeek = Math.max(1, calendarWeek(start, today()));
    const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
    const weekEnd = (w: number) => calendarWeekRange(start, w)[1];

    // ---- weight + 7-day average ----
    const wpts = logs.body.filter((b) => b.weightKg != null).map((b) => ({ date: b.id, value: b.weightKg! })).sort((a, b) => a.date.localeCompare(b.date));
    const ma = movingAverage7(wpts);
    const weight: ChartConfiguration = {
      type: 'line',
      data: {
        labels: wpts.map((p) => shortDate(p.date)),
        datasets: [
          { label: 'Morning weight', data: wpts.map((p) => p.value), borderColor: SERIES[0], backgroundColor: SERIES[0], showLine: false, pointRadius: 4, pointHoverRadius: 6 },
          { label: '7-day average', data: ma.map((p) => p.value), borderColor: SERIES[1], backgroundColor: SERIES[1], borderWidth: 2, pointRadius: 0, tension: 0.3 },
        ],
      },
      options: baseOptions('kg', true),
    };

    // ---- weekly calories vs target (avg of logged days) ----
    const kcalByDate = new Map<string, number>();
    for (const l of logs.food) kcalByDate.set(l.date, (kcalByDate.get(l.date) ?? 0) + l.macros.kcal);
    const kcalRows = weeks.map((w) => {
      const [from, to] = calendarWeekRange(start, w);
      const days = [...kcalByDate].filter(([d]) => d >= from && d <= to).map(([, v]) => v);
      const target = targetsForWeek(program, settings, programWeekOn(program, sessions, to > today() ? today() : to)).kcal;
      return { w, avg: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null, target, days: days.length };
    });
    const calories: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: kcalRows.map((r) => `W${r.w}`),
        datasets: [
          { type: 'bar', label: 'Avg kcal/day', data: kcalRows.map((r) => r.avg), backgroundColor: SERIES[0], borderRadius: 4, maxBarThickness: 28 },
          { type: 'line', label: 'Target', data: kcalRows.map((r) => r.target), borderColor: INK.text, borderWidth: 2, borderDash: [4, 4], pointRadius: 0, stepped: 'middle' },
        ],
      },
      options: baseOptions('kcal', true),
    };

    // ---- estimated 1RM per primary lift (best Epley per session, unswapped lifts only) ----
    const lifts = program.primary_lifts;
    const e1 = new Map<string, Map<string, number>>(lifts.map((l) => [l, new Map()]));
    for (const s of sessions) {
      if (s.status !== 'done') continue;
      for (const e of s.exercises) {
        const lift = lifts.find((l) => e.key.startsWith(l) && e.performed === e.key);
        if (!lift) continue;
        const v = bestE1rm(e.sets);
        if (v > 0) e1.get(lift)!.set(s.date, Math.max(e1.get(lift)!.get(s.date) ?? 0, Math.round(v * 10) / 10));
      }
    }
    const e1Dates = [...new Set([...e1.values()].flatMap((m) => [...m.keys()]))].sort();
    const oneRm: ChartConfiguration = {
      type: 'line',
      data: {
        labels: e1Dates.map(shortDate),
        datasets: lifts.map((l, i) => ({
          label: l, data: e1Dates.map((d) => e1.get(l)!.get(d) ?? null), spanGaps: true,
          borderColor: SERIES[i], backgroundColor: SERIES[i], borderWidth: 2, pointRadius: 3, pointHoverRadius: 6,
        })),
      },
      options: baseOptions('kg (Epley)', true),
    };

    // ---- weekly steps ----
    const stepsRows = weeks.map((w) => {
      const [from, to] = calendarWeekRange(start, w);
      const vals = logs.body.filter((b) => b.id >= from && b.id <= to && b.steps).map((b) => b.steps!);
      const pw = programWeekOn(program, sessions, to > today() ? today() : to);
      return { w, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, target: cardioPlanFor(program, pw).steps + (settings.stepsAdjust || 0) };
    });
    const steps: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: stepsRows.map((r) => `W${r.w}`),
        datasets: [
          { type: 'bar', label: 'Avg steps/day', data: stepsRows.map((r) => r.avg), backgroundColor: SERIES[2], borderRadius: 4, maxBarThickness: 28 },
          { type: 'line', label: 'Target', data: stepsRows.map((r) => r.target), borderColor: INK.text, borderWidth: 2, borderDash: [4, 4], pointRadius: 0, stepped: 'middle' },
        ],
      },
      options: baseOptions('steps', true),
    };

    // ---- training volume per program week ----
    const vol = weeklySetVolume(sessions);
    const volWeeks = program.weeks.map((w) => w.week).filter((w) => w <= week);
    const volume: ChartConfiguration = {
      type: 'bar',
      data: { labels: volWeeks.map((w) => `W${w}`), datasets: [{ label: 'Sets done', data: volWeeks.map((w) => vol.get(w) ?? 0), backgroundColor: SERIES[0], borderRadius: 4, maxBarThickness: 28 }] },
      options: (() => { const o = baseOptions('sets', false); return { ...o, scales: { ...o.scales, y: { ...o.scales.y, beginAtZero: true, ticks: { ...o.scales.y.ticks, precision: 0 } } } }; })(),
    };

    return { weekEnd, wpts, ma, weight, kcalRows, calories, e1, e1Dates, oneRm, stepsRows, steps, vol, volWeeks, volume };
  }, [logs, settings, sessions, week]);

  if (!charts) return null;
  const c = charts;
  const latestMa = c.ma.length ? c.ma[c.ma.length - 1].value : null;
  const firstW = c.wpts[0]?.value;

  return (
    <>
      <h1>Progress</h1>
      <div class="grid3">
        <div class="card center"><div class="small muted">7-day avg</div><div class="big-num" style={{ fontSize: 22 }}>{fmt(latestMa)}</div><div class="small muted">kg</div></div>
        <div class="card center"><div class="small muted">Change</div><div class="big-num" style={{ fontSize: 22 }}>{latestMa != null && firstW != null ? fmt(latestMa - firstW) : '–'}</div><div class="small muted">kg since start</div></div>
        <div class="card center"><div class="small muted">Workouts</div><div class="big-num" style={{ fontSize: 22 }}>{sessions.filter((s) => s.status === 'done').length}</div><div class="small muted">of {program.weeks.length * program.day_order.length}</div></div>
      </div>

      <ChartCard title="Body weight" subtitle="Daily morning weight and 7-day average" config={c.weight} empty={c.wpts.length < 2}
        table={{ headers: ['Date', 'kg', '7-day avg'], rows: c.wpts.map((p, i) => [p.date, fmt(p.value), fmt(c.ma[i].value)]).reverse() }} />
      <ChartCard title="Calories per week" subtitle="Average of logged days vs target" config={c.calories} empty={c.kcalRows.every((r) => r.avg == null)}
        table={{ headers: ['Week', 'Avg kcal', 'Target', 'Days'], rows: c.kcalRows.map((r) => [`W${r.w}`, r.avg ?? '–', r.target, r.days]).reverse() }} />
      <ChartCard title="Estimated 1RM" subtitle="Best Epley estimate per session" config={c.oneRm} empty={c.e1Dates.length < 1}
        table={{ headers: ['Date', ...program.primary_lifts.map((l) => l.split(' ').pop()!)], rows: c.e1Dates.map((d) => [d, ...program.primary_lifts.map((l) => fmt(c.e1.get(l)!.get(d) ?? null))]).reverse() }} />
      <ChartCard title="Steps per week" subtitle="Average steps/day vs target" config={c.steps} empty={c.stepsRows.every((r) => r.avg == null)}
        table={{ headers: ['Week', 'Avg steps', 'Target'], rows: c.stepsRows.map((r) => [`W${r.w}`, r.avg != null ? fmtInt(r.avg) : '–', fmtInt(r.target)]).reverse() }} />
      <ChartCard title="Training volume" subtitle="Sets completed per program week" config={c.volume} empty={c.vol.size === 0}
        table={{ headers: ['Week', 'Sets'], rows: c.volWeeks.map((w) => [`W${w}`, c.vol.get(w) ?? 0]).reverse() }} />
    </>
  );
}
