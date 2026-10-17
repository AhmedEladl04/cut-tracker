// Coaching rules from program.json → rules: progression hints, the recovery rule,
// the late-cut rule and AMRAP → new 1RM. Interpretations are documented per function.
import { epley, epleyRaw, parseReps, parseRpeUpper, roundTo } from './loads';
import type { Program, ProgramExercise, SetLog } from './types';

/** One past performance of an exercise (one session). */
export interface HistoryEntry { date: string; week: number; sets: SetLog[]; lastRpe: number | null }

const doneSets = (sets: SetLog[]) => sets.filter((s) => s.done && s.load != null && s.reps != null);

/** "80 × 8, 80 × 7" */
export function formatSets(sets: SetLog[]): string {
  return doneSets(sets).map((s) => `${s.load} × ${s.reps}`).join(', ');
}

export interface Hint { kind: 'add_load' | 'add_rep'; text: string; suggestedLoad?: number }

/**
 * rules.progression (accessories only): when ALL sets hit the top of the rep range at or
 * below the target RPE → +2.5 kg next time; otherwise aim for +1 rep.
 * "Target RPE" = upper bound of last_set_rpe (e.g. "~8-9" → 9). A missing RPE entry
 * doesn't block the +2.5 kg suggestion.
 */
export function progressionHint(ex: ProgramExercise, last: HistoryEntry | null, step = 2.5): Hint | null {
  if (ex.is_primary || !last) return null;
  const range = parseReps(ex.reps);
  if (range.amrap || range.max === 0) return null;
  const done = doneSets(last.sets);
  if (done.length === 0) return null;
  const target = parseRpeUpper(ex.last_set_rpe);
  const allTop = done.length >= ex.sets && done.every((s) => (s.reps ?? 0) >= range.max);
  const rpeOk = last.lastRpe == null || target == null || last.lastRpe <= target;
  if (allTop && rpeOk) {
    const top = Math.max(...done.map((s) => s.load ?? 0));
    return { kind: 'add_load', text: `All sets hit ${range.max} — try +${step} kg (${roundTo(top + step, step)} kg)`, suggestedLoad: roundTo(top + step, step) };
  }
  return { kind: 'add_rep', text: 'Same load — aim for +1 rep on at least one set' };
}

/** Best Epley estimate in a session (unrounded). 0 if nothing logged. */
export function bestE1rm(sets: SetLog[]): number {
  return Math.max(0, ...doneSets(sets).map((s) => epleyRaw(s.load!, s.reps!)));
}

/**
 * rules.recovery_rule: "performance drops two sessions in a row" = the best estimated 1RM
 * fell in each of the last two sessions compared with the one before
 * (needs ≥ 3 sessions; history oldest → newest).
 */
export function performanceDroppedTwice(history: HistoryEntry[]): boolean {
  const e = history.map((h) => bestE1rm(h.sets)).filter((x) => x > 0);
  if (e.length < 3) return false;
  const [a, b, c] = e.slice(-3);
  return b < a && c < b;
}

/** Parse "Weeks 15-18: …" from rules.late_cut_rule. */
export function lateCutWeeks(program: Program): [number, number] {
  const m = program.rules.late_cut_rule.match(/weeks?\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (!m) throw new Error('Cannot parse late_cut_rule weeks');
  return [Number(m[1]), Number(m[2])];
}

export function isLateCutWeek(program: Program, week: number): boolean {
  const [a, b] = lateCutWeeks(program);
  return week >= a && week <= b;
}

/**
 * rules.late_cut_rule: "a top set misses its rep target" = a done set of a "[Top set]"
 * exercise has fewer reps than the bottom of its rep range.
 */
export function topSetMissed(ex: ProgramExercise, sets: SetLog[]): boolean {
  if (!/\[top set\]/i.test(ex.name)) return false;
  const { min } = parseReps(ex.reps);
  return doneSets(sets).some((s) => (s.reps ?? 0) < min);
}

export const isBackOff = (ex: ProgramExercise) => /\[back-off\]/i.test(ex.name);
export const isAmrap = (ex: ProgramExercise) => parseReps(ex.reps).amrap;
export const allowsFailure = (rpe: string | null) => !!rpe && rpe.includes('*');

export interface AmrapResult { oldOneRm: number; newOneRm: number; change: number }

/** AMRAP test: new 1RM = Epley(load, reps) rounded to 2.5 kg. */
export function amrapResult(oldOneRm: number, load: number, reps: number, step = 2.5): AmrapResult {
  const newOneRm = epley(load, reps, step);
  return { oldOneRm, newOneRm, change: Number((newOneRm - oldOneRm).toFixed(2)) };
}
