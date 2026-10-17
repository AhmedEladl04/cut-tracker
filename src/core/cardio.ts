// Cardio & steps targets from program.json → cardio_plan.
import { isLowerDay } from './schedule';
import type { CardioLog, CardioPlanEntry, DayName, Program } from './types';

export function cardioPlanFor(program: Program, week: number): CardioPlanEntry {
  const e = program.cardio_plan.find((p) => week >= p.weeks[0] && week <= p.weeks[1]);
  return e ?? program.cardio_plan[program.cardio_plan.length - 1];
}

export const isLiss = (c: Pick<CardioLog, 'type'>) => c.type === 'incline_walk' || c.type === 'bike';

export interface CardioProgress {
  stepsAvg: number;          // average over days that have a step count
  stepsDays: number;
  stepsTarget: number;
  lissDone: number;
  lissTarget: number;
  lissMinutes: number;
  intervalsDone: number;
  intervalsOptional: number;
  note?: string;
}

/** Weekly progress: steps per day (array, nulls = not logged) and that week's cardio logs. */
export function cardioProgress(
  plan: CardioPlanEntry,
  steps: (number | null | undefined)[],
  cardio: CardioLog[],
  stepsAdjust = 0,
): CardioProgress {
  const logged = steps.filter((s): s is number => typeof s === 'number' && s > 0);
  const active = cardio.filter((c) => !c.deleted);
  return {
    stepsAvg: logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0,
    stepsDays: logged.length,
    stepsTarget: plan.steps + stepsAdjust,
    lissDone: active.filter(isLiss).length,
    lissTarget: plan.liss_sessions,
    lissMinutes: plan.liss_minutes,
    intervalsDone: active.filter((c) => c.type === 'intervals').length,
    intervalsOptional: plan.intervals_optional,
    note: plan.note,
  };
}

/**
 * "Warn if I log intervals the day before a Lower day." With a rolling schedule the
 * best guess for "tomorrow's workout" is the next workout in the order.
 */
export function intervalsWarning(type: CardioLog['type'], nextDay: DayName): string | null {
  if (type !== 'intervals' || !isLowerDay(nextDay)) return null;
  return `Your next workout is ${nextDay}. Intervals the day before a Lower day hurt leg recovery — consider LISS instead.`;
}
