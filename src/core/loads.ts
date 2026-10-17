// Load maths: target loads for primary lifts, Epley 1RM, rep/rest parsing.
import type { Lift, ProgramExercise, Settings } from './types';

export const DEFAULT_ROUNDING = 2.5;

/** Round to the nearest plate step (2.5 kg by default). */
export function roundTo(x: number, step = DEFAULT_ROUNDING): number {
  // The "+ 0" turns -0 into 0; toFixed avoids float noise like 82.50000001.
  return Number((Math.round(x / step) * step).toFixed(3)) + 0;
}

/** rules.target_load: round(one_rm * percent_1rm / 2.5) * 2.5 */
export function targetLoad(oneRm: number, percent: number, step = DEFAULT_ROUNDING): number {
  return roundTo(oneRm * percent, step);
}

/** Unrounded Epley estimate — used for trend charts and comparisons. */
export function epleyRaw(load: number, reps: number): number {
  if (reps <= 0 || load <= 0) return 0;
  return load * (1 + reps / 30);
}

/** rules.epley_1rm: load × (1 + reps/30), rounded to 2.5 kg */
export function epley(load: number, reps: number, step = DEFAULT_ROUNDING): number {
  return roundTo(epleyRaw(load, reps), step);
}

/** Which 1RM an exercise uses: weeks 11-20 use the post-AMRAP value when it exists. */
export function oneRmFor(ex: ProgramExercise, s: Pick<Settings, 'oneRm' | 'oneRmAfter10'>): number | null {
  if (!ex.is_primary || ex.percent_1rm == null) return null;
  const lift = ex.base_exercise as Lift;
  if (ex.one_rm_source === 'after_week10_amrap') return s.oneRmAfter10[lift] ?? s.oneRm[lift] ?? null;
  return s.oneRm[lift] ?? null;
}

export function exerciseTargetLoad(
  ex: ProgramExercise,
  s: Pick<Settings, 'oneRm' | 'oneRmAfter10'>,
  step = DEFAULT_ROUNDING,
): number | null {
  const rm = oneRmFor(ex, s);
  return rm == null || ex.percent_1rm == null ? null : targetLoad(rm, ex.percent_1rm, step);
}

export interface RepRange { min: number; max: number; amrap: boolean; perLeg: boolean }

/** "8-10" → {8,10}; "5" → {5,5}; "8-10/leg" → perLeg; "AMRAP" → amrap. */
export function parseReps(reps: string): RepRange {
  if (/amrap/i.test(reps)) return { min: 1, max: 99, amrap: true, perLeg: false };
  const perLeg = /\/leg/i.test(reps);
  const nums = reps.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return { min: 0, max: 0, amrap: false, perLeg };
  return { min: nums[0], max: nums[nums.length > 1 ? 1 : 0], amrap: false, perLeg };
}

/** "~8-9" → 9 (upper bound); "~7" → 7; "RPE ~9-10 (AMRAP...)" → 10; null → null. */
export function parseRpeUpper(rpe: string | null): number | null {
  if (!rpe) return null;
  const nums = rpe.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return nums.length ? Math.max(...nums) : null;
}

/** "2-3 min" → [120, 180] seconds. */
export function parseRest(rest: string): [number, number] {
  const nums = rest.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length === 0) return [90, 90];
  const unit = /s(ec)?\b/i.test(rest) && !/min/i.test(rest) ? 1 : 60;
  return [nums[0] * unit, (nums[1] ?? nums[0]) * unit];
}

/** The tag after the base name, e.g. " [Top set]" (empty for plain exercises). */
export function variantTag(ex: Pick<ProgramExercise, 'name' | 'base_exercise'>): string {
  return ex.name.startsWith(ex.base_exercise) ? ex.name.slice(ex.base_exercise.length) : '';
}

export function substitutionsOf(ex: ProgramExercise): string[] {
  return (ex.substitutions ?? '').split('/').map((s) => s.trim()).filter(Boolean);
}
