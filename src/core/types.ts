// Shapes of program.json and of the records stored on the phone.
// TypeScript "interface" ≈ a Java interface that only describes fields (no runtime cost).

export type DayName = 'Upper A' | 'Lower A' | 'Upper B' | 'Lower B';
export type Lift = 'Back Squat' | 'Barbell Bench Press' | 'Overhead Press' | 'Deadlift';

export interface ProgramExercise {
  name: string;               // e.g. "Back Squat [Top set]"
  base_exercise: string;      // e.g. "Back Squat"
  is_primary: boolean;
  percent_1rm: number | null;
  one_rm_source: 'current' | 'after_week10_amrap' | null;
  warmup_sets: string | null;
  sets: number;
  reps: string;               // "8-10", "5", "8-10/leg", "AMRAP"
  early_rpe: string | null;   // "~7"
  last_set_rpe: string | null;
  rest: string;               // "2-3 min"
  cue: string;
  substitutions: string | null; // "A / B / C"
}

export interface ProgramDay { day: DayName; exercises: ProgramExercise[] }

export interface ProgramWeek {
  week: number;
  phase: string;
  calories: 'cut' | 'maintenance';
  calorie_note: string;
  cardio: string;
  days: ProgramDay[];
}

export interface CardioPlanEntry {
  weeks: [number, number];
  steps: number;
  liss_sessions: number;
  liss_minutes: number;
  intervals_optional: number;
  note?: string;
}

export interface Program {
  name: string;
  day_order: DayName[];
  primary_lifts: Lift[];
  weeks: ProgramWeek[];
  rules: {
    load_rounding_kg: number;
    target_load: string;
    epley_1rm: string;
    amrap_weeks: number[];
    amrap_percent: Partial<Record<Lift, number>>;
    failure_note: string;
    recovery_rule: string;
    late_cut_rule: string;
    progression: string;
  };
  nutrition: {
    maintenance_estimate: string;
    cut_kcal: string;
    maintenance_weeks: number[];
    protein_g: string;
    fat_g: string;
    carbs_g: string;
    recalculate_at_week: number;
    target_weekly_loss_pct: [number, number];
    adjust_rules: string[];
  };
  cardio_plan: CardioPlanEntry[];
}

// ---------- Records stored in IndexedDB ----------
// Every synced record has id + updatedAt (ms since epoch) + optional deleted flag.
// Deletes are "soft" (deleted: true) so the sync server learns about them too.
export interface Syncable { id: string; updatedAt: number; deleted?: boolean }

export interface Settings extends Syncable {
  id: 'me';
  startDate: string;                 // "YYYY-MM-DD"
  bodyweightKg: number;              // used for macro targets
  maintenanceOverride: number | null;
  kcalAdjust: number;                // manual tweaks from the weekly check-in advice
  stepsAdjust: number;
  oneRm: Record<Lift, number>;       // current 1RMs (weeks 1-10)
  oneRmAfter10: Partial<Record<Lift, number>>; // from the Week 10 AMRAP (weeks 11-20)
  week11RecalcDone: boolean;
  syncUrl: string;
  syncToken: string;
}

export interface SetLog { load: number | null; reps: number | null; done: boolean }

export interface SessionExercise {
  key: string;        // program exercise name, e.g. "Back Squat [Back-off]"
  performed: string;  // name actually performed (differs when swapped)
  sets: SetLog[];
  lastRpe: number | null;
}

export interface Session extends Syncable {
  week: number;
  day: DayName;
  date: string;          // "YYYY-MM-DD" (day the session started)
  startedAt: number;
  finishedAt: number | null;
  durationMin: number | null;
  status: 'in_progress' | 'done';
  exercises: SessionExercise[];
}

export interface Swap extends Syncable { substitute: string | null } // id = base exercise

export interface Macros { kcal: number; protein: number; carbs: number; fat: number }
export interface Serving { label: string; grams: number }

export type FoodSource = 'estimate' | 'off' | 'manual' | 'recipe';

export interface Food extends Syncable {
  nameEn: string;
  nameAr: string;
  aliases: string[];
  brand?: string;
  barcode?: string;
  per100: Macros;
  servings: Serving[];
  source: FoodSource;
  favourite?: boolean;
  lastUsedAt?: number;
  searchKeys?: string[];   // derived, for the IndexedDB multi-entry index
}

export interface RecipeIngredient { foodId: string; name: string; grams: number; per100: Macros }

export interface Recipe extends Syncable {
  name: string;
  ingredients: RecipeIngredient[];
  cookedWeightG: number;
  plateG: number;
  foodId: string;          // the Food record generated from this recipe
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodLog extends Syncable {
  date: string;
  meal: Meal;
  foodId: string;
  name: string;          // copied at log time so history stays readable
  grams: number;
  servingLabel: string | null;
  servings: number | null;
  macros: Macros;        // already scaled to the grams eaten
}

export interface BodyLog extends Syncable {   // id = "YYYY-MM-DD"
  weightKg?: number | null;
  waistCm?: number | null;
  steps?: number | null;
}

export type CardioType = 'incline_walk' | 'bike' | 'intervals' | 'other';
export interface CardioLog extends Syncable {
  date: string;
  type: CardioType;
  minutes: number;
  avgHr: number | null;
}

export interface OneRmChange extends Syncable {
  date: string;
  lift: Lift;
  oldOneRm: number;
  newOneRm: number;
  load: number;
  reps: number;
}
