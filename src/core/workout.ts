// Building a workout session: which name is performed (after swaps), what to prefill,
// and the per-exercise history used for "last time" and the coaching rules.
import { exerciseTargetLoad, parseReps, variantTag } from './loads';
import type { HistoryEntry } from './rules';
import type { ProgramExercise, Session, SessionExercise, Settings, SetLog } from './types';

/** Name actually performed: the swap (plus the variant tag, e.g. " [Back-off]") or the program name. */
export function performedName(ex: ProgramExercise, swap: string | null | undefined): string {
  return swap ? swap + variantTag(ex) : ex.name;
}

/** History per performed exercise name, oldest → newest, from DONE sessions. */
export function buildHistory(sessions: Session[], excludeId?: string): Map<string, HistoryEntry[]> {
  const map = new Map<string, HistoryEntry[]>();
  const done = sessions
    .filter((s) => s.status === 'done' && !s.deleted && s.id !== excludeId)
    .sort((a, b) => (a.finishedAt ?? a.startedAt) - (b.finishedAt ?? b.startedAt));
  for (const s of done) {
    for (const e of s.exercises) {
      if (!e.sets.some((x) => x.done)) continue;
      const list = map.get(e.performed) ?? [];
      list.push({ date: s.date, week: s.week, sets: e.sets, lastRpe: e.lastRpe });
      map.set(e.performed, list);
    }
  }
  return map;
}

export const lastOf = (h: Map<string, HistoryEntry[]>, name: string): HistoryEntry | null => {
  const l = h.get(name);
  return l && l.length ? l[l.length - 1] : null;
};

/**
 * Prefilled sets for an exercise.
 *  - Primary lifts: the target load from %1RM and the bottom of the rep range.
 *  - Others: what you did last time on that set (or the last set you did), else empty load
 *    and the bottom of the rep range.
 */
export function initialSets(
  ex: ProgramExercise,
  settings: Pick<Settings, 'oneRm' | 'oneRmAfter10'>,
  last: HistoryEntry | null,
): SetLog[] {
  const range = parseReps(ex.reps);
  const target = exerciseTargetLoad(ex, settings);
  const lastDone = last?.sets.filter((s) => s.done) ?? [];
  return Array.from({ length: ex.sets }, (_, i) => {
    if (target != null) return { load: target, reps: range.amrap ? null : range.min, done: false };
    const prev = lastDone[i] ?? lastDone[lastDone.length - 1];
    return { load: prev?.load ?? null, reps: prev?.reps ?? (range.min || null), done: false };
  });
}

export function initialExercise(
  ex: ProgramExercise,
  settings: Pick<Settings, 'oneRm' | 'oneRmAfter10'>,
  swap: string | null | undefined,
  history: Map<string, HistoryEntry[]>,
): SessionExercise {
  const performed = performedName(ex, swap);
  return { key: ex.name, performed, sets: initialSets(ex, settings, lastOf(history, performed)), lastRpe: null };
}
