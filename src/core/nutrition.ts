// Calorie & macro targets. The numbers (31, 450, 2.0, 0.8 …) are read from the
// strings in program.json → nutrition, so the program file stays the single source of truth.
import type { Macros, Program, Settings } from './types';

/** Pull the first number out of a formula string, e.g. "bodyweight_kg * 31" → 31. */
export function firstNumber(formula: string): number {
  const m = formula.match(/\d+(\.\d+)?/);
  if (!m) throw new Error(`No number in formula: "${formula}"`);
  return Number(m[0]);
}

export interface NutritionFactors { maintPerKg: number; cutDeficit: number; proteinPerKg: number; fatPerKg: number }

export function nutritionFactors(program: Program): NutritionFactors {
  const n = program.nutrition;
  return {
    maintPerKg: firstNumber(n.maintenance_estimate),
    cutDeficit: firstNumber(n.cut_kcal),
    proteinPerKg: firstNumber(n.protein_g),
    fatPerKg: firstNumber(n.fat_g),
  };
}

export function maintenanceKcal(program: Program, bodyweightKg: number, override: number | null): number {
  if (override && override > 0) return Math.round(override);
  return Math.round(bodyweightKg * nutritionFactors(program).maintPerKg);
}

export function isMaintenanceWeek(program: Program, week: number): boolean {
  const w = program.weeks.find((x) => x.week === week);
  return w ? w.calories === 'maintenance' : program.nutrition.maintenance_weeks.includes(week);
}

export interface Targets extends Macros { phase: 'cut' | 'maintenance'; maintenance: number }

/**
 * Targets for a program week. Carbs are the remainder: (kcal − protein×4 − fat×9) / 4.
 * kcalAdjust (from check-in advice) only applies to cut weeks.
 */
export function targetsForWeek(
  program: Program,
  s: Pick<Settings, 'bodyweightKg' | 'maintenanceOverride' | 'kcalAdjust'>,
  week: number,
): Targets {
  const f = nutritionFactors(program);
  const maintenance = maintenanceKcal(program, s.bodyweightKg, s.maintenanceOverride);
  const maint = isMaintenanceWeek(program, week);
  const kcal = maint ? maintenance : maintenance - f.cutDeficit + (s.kcalAdjust || 0);
  const protein = Math.round(s.bodyweightKg * f.proteinPerKg);
  const fat = Math.round(s.bodyweightKg * f.fatPerKg);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs, phase: maint ? 'maintenance' : 'cut', maintenance };
}

// ---------- Colour status for the progress bars ----------
export type Status = 'green' | 'amber' | 'red';

/** Tolerances used for colours and calendar ticks — tweak here. */
export const TOLERANCE = {
  kcalHit: 100,          // ±100 kcal = "calories on target" (calendar tick)
  kcalAmber: 250,
  proteinHitPct: 0.95,   // ≥95 % of target = "protein hit"
  proteinAmberPct: 0.8,
  macroGreenPct: 0.15,   // carbs/fat within ±15 % green, ±30 % amber
  macroAmberPct: 0.3,
};

export function kcalStatus(actual: number, target: number): Status {
  const d = Math.abs(actual - target);
  if (d <= TOLERANCE.kcalHit) return 'green';
  return d <= TOLERANCE.kcalAmber ? 'amber' : 'red';
}

export function proteinStatus(actual: number, target: number): Status {
  if (target <= 0) return 'green';
  const r = actual / target;
  if (r >= TOLERANCE.proteinHitPct) return 'green';
  return r >= TOLERANCE.proteinAmberPct ? 'amber' : 'red';
}

export function macroStatus(actual: number, target: number): Status {
  if (target <= 0) return 'green';
  const d = Math.abs(actual - target) / target;
  if (d <= TOLERANCE.macroGreenPct) return 'green';
  return d <= TOLERANCE.macroAmberPct ? 'amber' : 'red';
}

export const kcalHit = (actual: number, target: number) => Math.abs(actual - target) <= TOLERANCE.kcalHit;
export const proteinHit = (actual: number, target: number) => actual >= target * TOLERANCE.proteinHitPct;

// ---------- Weekly weight check-in ----------

export interface AdjustRule { op: '<' | '>'; pct: number; consecutive: number; advice: string; text: string }

/** Parse "weekly avg loss < 0.5% for 2 consecutive cut weeks -> suggest -150 kcal …". */
export function parseAdjustRule(text: string): AdjustRule {
  const m = text.match(/loss\s*([<>])\s*(\d+(?:\.\d+)?)\s*%/i);
  if (!m) throw new Error(`Cannot parse adjust rule: "${text}"`);
  const c = text.match(/for\s+(\d+)\s+consecutive/i);
  const advice = text.split('->')[1]?.trim() ?? text;
  return { op: m[1] as '<' | '>', pct: Number(m[2]), consecutive: c ? Number(c[1]) : 1, advice, text };
}

/** Weekly loss in % of bodyweight; positive = lost weight. */
export function weeklyLossPct(prevAvg: number, avg: number): number {
  return ((prevAvg - avg) / prevAvg) * 100;
}

/**
 * Advice from nutrition.adjust_rules. `losses` = weekly loss % for consecutive completed
 * CUT weeks, oldest → newest. Returns the rules that fire.
 */
export function adjustAdvice(program: Program, losses: number[]): AdjustRule[] {
  const rules = program.nutrition.adjust_rules.map(parseAdjustRule);
  return rules.filter((r) => {
    if (losses.length < r.consecutive) return false;
    const recent = losses.slice(-r.consecutive);
    return recent.every((l) => (r.op === '<' ? l < r.pct : l > r.pct));
  });
}

// ---------- Food maths ----------

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function scaleMacros(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return { kcal: per100.kcal * k, protein: per100.protein * k, carbs: per100.carbs * k, fat: per100.fat * k };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, ZERO);
}

export function roundMacros(m: Macros, digits = 1): Macros {
  const r = (x: number) => Number(x.toFixed(digits));
  return { kcal: Math.round(m.kcal), protein: r(m.protein), carbs: r(m.carbs), fat: r(m.fat) };
}

export interface RecipeResult { total: Macros; rawWeightG: number; per100: Macros; perPlate: Macros }

/**
 * Recipe macros: sum the raw ingredients, then spread them over the COOKED weight
 * (water evaporates or is absorbed, so cooked weight ≠ sum of ingredients).
 */
export function recipeMacros(
  ingredients: { per100: Macros; grams: number }[],
  cookedWeightG: number,
  plateG: number,
): RecipeResult {
  const total = sumMacros(ingredients.map((i) => scaleMacros(i.per100, i.grams)));
  const rawWeightG = ingredients.reduce((s, i) => s + i.grams, 0);
  const weight = cookedWeightG > 0 ? cookedWeightG : rawWeightG;
  // per100 = total × (100 / weight). scaleMacros(m, g) multiplies by g/100, so pass g = 100×100/weight.
  const per100 = weight > 0 ? scaleMacros(total, 10000 / weight) : ZERO;
  return { total, rawWeightG, per100, perPlate: scaleMacros(per100, plateG) };
}
