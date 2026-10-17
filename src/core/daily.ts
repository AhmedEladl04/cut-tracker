// Per-day ticks for the calendar, and weekly check-in rows for body weight.
import { calendarWeek, calendarWeekRange } from './dates';
import { kcalHit, proteinHit } from './nutrition';
import type { DatedValue } from './stats';

export interface DayData {
  date: string;
  workoutDone: boolean;
  kcal: number | null;      // null = no food logged that day
  protein: number;
  steps: number | null;
  cardioCount: number;
  weightLogged: boolean;
}
export interface DayTargets { kcal: number; protein: number; steps: number }
export interface DayTicks { workout: boolean; calories: boolean; protein: boolean; steps: boolean; cardio: boolean; weight: boolean }

export const TICK_LABELS: Record<keyof DayTicks, string> = {
  workout: 'Workout', calories: 'Calories ±100', protein: 'Protein', steps: 'Steps', cardio: 'Cardio', weight: 'Weight',
};

export function dayTicks(d: DayData, t: DayTargets): DayTicks {
  return {
    workout: d.workoutDone,
    calories: d.kcal != null && kcalHit(d.kcal, t.kcal),
    protein: d.kcal != null && proteinHit(d.protein, t.protein),
    steps: d.steps != null && d.steps >= t.steps,
    cardio: d.cardioCount > 0,
    weight: d.weightLogged,
  };
}

export interface CheckinRow {
  week: number;              // calendar week from the start date
  from: string;
  to: string;
  avg: number | null;        // average morning weight
  lossPct: number | null;    // vs previous week; positive = lost weight
  waist: number | null;      // last waist measurement in that week
  cut: boolean;
  complete: boolean;         // week is over
}

/** One row per calendar week from week 1 up to the week containing `todayDate`. */
export function checkinRows(
  startDate: string,
  todayDate: string,
  weights: DatedValue[],
  waists: DatedValue[],
  isCut: (week: number) => boolean,
): CheckinRow[] {
  const last = Math.max(1, calendarWeek(startDate, todayDate));
  const rows: CheckinRow[] = [];
  for (let w = 1; w <= last; w++) {
    const [from, to] = calendarWeekRange(startDate, w);
    const inWeek = weights.filter((p) => p.date >= from && p.date <= to);
    const avg = inWeek.length ? Number((inWeek.reduce((s, p) => s + p.value, 0) / inWeek.length).toFixed(2)) : null;
    const prev = rows[rows.length - 1]?.avg ?? null;
    const waist = waists.filter((p) => p.date >= from && p.date <= to).sort((a, b) => a.date.localeCompare(b.date)).pop()?.value ?? null;
    rows.push({
      week: w, from, to, avg, waist,
      lossPct: avg != null && prev != null ? Number((((prev - avg) / prev) * 100).toFixed(2)) : null,
      cut: isCut(w),
      complete: to < todayDate,
    });
  }
  return rows;
}

/** Weekly losses of the most recent run of completed CUT weeks, oldest → newest. */
export function trailingCutLosses(rows: CheckinRow[]): number[] {
  const out: number[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r.complete) continue;
    if (!r.cut || r.lossPct == null) break;
    out.unshift(r.lossPct);
  }
  return out;
}
