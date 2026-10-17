// Which workout is next? The program follows a rolling order (Upper A → Lower A →
// Upper B → Lower B) instead of fixed weekdays. A week is complete when all 4 of its
// sessions are done; then the next week starts.
import type { DayName, Program, ProgramWeek } from './types';

/** Minimal session info the scheduler needs (full Session records also fit). */
export interface DoneSession { week: number; day: DayName; date: string; status: 'in_progress' | 'done'; deleted?: boolean }

export interface NextWorkout { week: number; day: DayName; programComplete: boolean }

/** Set of "week|day" keys that are completed. */
function doneKeys(sessions: DoneSession[]): Set<string> {
  return new Set(sessions.filter((s) => s.status === 'done' && !s.deleted).map((s) => `${s.week}|${s.day}`));
}

export function isWeekComplete(program: Program, week: number, sessions: DoneSession[]): boolean {
  const done = doneKeys(sessions);
  return program.day_order.every((d) => done.has(`${week}|${d}`));
}

/** The first week that isn't complete, and the first day (in rolling order) not done in it. */
export function nextWorkout(program: Program, sessions: DoneSession[]): NextWorkout {
  const done = doneKeys(sessions);
  for (const w of program.weeks) {
    for (const day of program.day_order) {
      if (!done.has(`${w.week}|${day}`)) return { week: w.week, day, programComplete: false };
    }
  }
  const last = program.weeks[program.weeks.length - 1];
  return { week: last.week, day: program.day_order[program.day_order.length - 1], programComplete: true };
}

/** The "program week" right now = the week of the next workout. Drives header, calories and cardio. */
export function currentProgramWeek(program: Program, sessions: DoneSession[]): number {
  return nextWorkout(program, sessions).week;
}

/**
 * Program week that applied on a given date: computed from sessions done BEFORE that
 * date, but if you trained that day it is at least that session's week.
 */
export function programWeekOn(program: Program, sessions: DoneSession[], date: string): number {
  const before = sessions.filter((s) => s.date < date);
  let week = currentProgramWeek(program, before);
  for (const s of sessions) if (s.date === date && s.status === 'done' && !s.deleted) week = Math.max(week, s.week);
  return week;
}

export function getWeek(program: Program, week: number): ProgramWeek {
  const w = program.weeks.find((x) => x.week === week);
  if (!w) throw new Error(`Week ${week} not in program`);
  return w;
}

export const isLowerDay = (day: DayName) => day.startsWith('Lower');
