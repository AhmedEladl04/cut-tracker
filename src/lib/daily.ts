// Gathers everything logged per day (food, steps, weight, cardio, workouts) for the
// calendar, streaks and charts. A 20-week program is only a few thousand rows, so we
// simply load it all; useLiveQuery keeps it up to date.
import { useLiveQuery } from 'dexie-react-hooks';
import { cardioPlanFor, programWeekOn, targetsForWeek, type DayData, type DayTargets } from '../core';
import type { BodyLog, CardioLog, FoodLog } from '../core/types';
import { db } from '../db/db';
import { alive } from '../db/repo';
import { useApp } from './state';
import { program } from '../program';

export interface AllLogs { food: FoodLog[]; body: BodyLog[]; cardio: CardioLog[] }

export function useAllLogs(): AllLogs | undefined {
  return useLiveQuery(async () => ({
    food: alive(await db.foodLogs.toArray()),
    body: alive(await db.bodyLogs.toArray()),
    cardio: alive(await db.cardio.toArray()),
  }), []);
}

export function useDayIndex() {
  const { sessions, settings } = useApp();
  const logs = useAllLogs();
  if (!logs) return null;

  const food = new Map<string, { kcal: number; protein: number }>();
  for (const l of logs.food) {
    const cur = food.get(l.date) ?? { kcal: 0, protein: 0 };
    food.set(l.date, { kcal: cur.kcal + l.macros.kcal, protein: cur.protein + l.macros.protein });
  }
  const body = new Map(logs.body.map((b) => [b.id, b]));
  const cardioCount = new Map<string, number>();
  for (const c of logs.cardio) cardioCount.set(c.date, (cardioCount.get(c.date) ?? 0) + 1);
  const workoutDays = new Set(sessions.filter((s) => s.status === 'done').map((s) => s.date));

  const data = (date: string): DayData => {
    const f = food.get(date);
    const b = body.get(date);
    return {
      date,
      workoutDone: workoutDays.has(date),
      kcal: f ? Math.round(f.kcal) : null,
      protein: f ? f.protein : 0,
      steps: b?.steps ?? null,
      cardioCount: cardioCount.get(date) ?? 0,
      weightLogged: b?.weightKg != null,
    };
  };
  const targets = (date: string): DayTargets => {
    const week = programWeekOn(program, sessions, date);
    const t = targetsForWeek(program, settings, week);
    return { kcal: t.kcal, protein: t.protein, steps: cardioPlanFor(program, week).steps + (settings.stepsAdjust || 0) };
  };
  return { logs, data, targets };
}
