import { describe, expect, it } from 'vitest';
import programJson from '../../program.json';
import {
  addDays, adjustAdvice, amrapResult, bestStreak, calendarWeek, cardioPlanFor, cardioProgress,
  currentProgramWeek, currentStreak, diffDays, epley, exerciseTargetLoad, getWeek, intervalsWarning,
  isLateCutWeek, isMaintenanceWeek, isWeekComplete, kcalStatus, macroStatus, maintenanceKcal,
  matchScore, movingAverage7, nextWorkout, normalizeLatin, parseAdjustRule, parseReps, parseRest,
  parseRpeUpper, pctChange, performanceDroppedTwice, programWeekOn, progressionHint, proteinStatus,
  recipeMacros, roundTo, searchFoods, searchKeysFor, targetLoad, targetsForWeek, tokens, topSetMissed,
  weeklyAverages, weeklyLossPct, weeklySetVolume, daysSince, backupOverdue, variantTag, substitutionsOf,
  type DoneSession,
} from './index';
import type { CardioLog, DayName, Program, ProgramExercise, SetLog } from './types';

const program = programJson as unknown as Program;
const days = program.day_order;
const ex = (week: number, day: DayName, name: string): ProgramExercise =>
  getWeek(program, week).days.find((d) => d.day === day)!.exercises.find((e) => e.name === name)!;
const set = (load: number, reps: number, done = true): SetLog => ({ load, reps, done });

describe('dates', () => {
  it('adds days across month ends and counts calendar weeks', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(diffDays('2026-03-01', '2026-03-29')).toBe(28);
    expect(calendarWeek('2026-01-01', '2026-01-07')).toBe(1);
    expect(calendarWeek('2026-01-01', '2026-01-08')).toBe(2);
  });
});

describe('loads', () => {
  it('rounds to 2.5 kg', () => {
    expect(roundTo(81.2)).toBe(80);
    expect(roundTo(81.3)).toBe(82.5);
    expect(roundTo(83.75)).toBe(85); // .5 rounds up
  });
  it('target load = round(1RM × % / 2.5) × 2.5', () => {
    expect(targetLoad(100, 0.75)).toBe(75);
    expect(targetLoad(137.5, 0.675)).toBe(92.5); // 92.81 → 92.5
    expect(targetLoad(60, 0.825)).toBe(50);       // 49.5 → 50
  });
  it('Epley 1RM rounded to 2.5', () => {
    expect(epley(100, 5)).toBe(117.5);  // 116.67
    expect(epley(90, 10)).toBe(120);
  });
  it('week 1-10 use current 1RM, weeks 11-20 the post-AMRAP one (fallback: current)', () => {
    const s = { oneRm: { 'Back Squat': 140, 'Barbell Bench Press': 100, 'Overhead Press': 60, Deadlift: 180 }, oneRmAfter10: { 'Barbell Bench Press': 110 } };
    const w1 = ex(1, 'Upper A', 'Barbell Bench Press');
    expect(exerciseTargetLoad(w1, s)).toBe(75); // 100 × 0.75
    const w15 = ex(15, 'Upper A', 'Barbell Bench Press [Top set]');
    expect(exerciseTargetLoad(w15, s)).toBe(97.5); // 110 × 0.875 = 96.25 → 97.5
    const ohp15 = ex(15, 'Upper B', 'Overhead Press');
    expect(exerciseTargetLoad(ohp15, s)).toBe(47.5); // no OHP AMRAP → current 60 × 0.775 = 46.5 → 47.5
    expect(exerciseTargetLoad(ex(1, 'Upper A', 'Wide-Grip Lat Pulldown'), s)).toBeNull();
  });
  it('parses reps, RPE and rest strings', () => {
    expect(parseReps('8-10')).toEqual({ min: 8, max: 10, amrap: false, perLeg: false });
    expect(parseReps('5')).toMatchObject({ min: 5, max: 5 });
    expect(parseReps('8-10/leg')).toMatchObject({ min: 8, max: 10, perLeg: true });
    expect(parseReps('AMRAP').amrap).toBe(true);
    expect(parseRpeUpper('~8-9')).toBe(9);
    expect(parseRpeUpper('~9-10*')).toBe(10);
    expect(parseRpeUpper(null)).toBeNull();
    expect(parseRest('2-3 min')).toEqual([120, 180]);
    expect(parseRest('1-2 min')).toEqual([60, 120]);
  });
  it('splits variant tags and substitutions', () => {
    expect(variantTag({ name: 'Back Squat [Top set]', base_exercise: 'Back Squat' })).toBe(' [Top set]');
    expect(substitutionsOf(ex(1, 'Upper A', 'Barbell Bench Press'))).toEqual(['DB bench press', 'Machine chest press', 'Smith bench']);
  });
});

describe('program.json sanity', () => {
  it('has 20 weeks × 4 days and every reps/rest string parses', () => {
    expect(program.weeks).toHaveLength(20);
    for (const w of program.weeks) {
      expect(w.days.map((d) => d.day)).toEqual(days);
      for (const d of w.days) for (const e of d.exercises) {
        const r = parseReps(e.reps);
        expect(r.amrap || r.max > 0).toBe(true);
        expect(parseRest(e.rest)[0]).toBeGreaterThan(0);
        if (e.is_primary) expect(e.percent_1rm).toBeGreaterThan(0);
      }
    }
  });
});

describe('schedule', () => {
  const done = (week: number, day: DayName, date = '2026-01-01'): DoneSession => ({ week, day, date, status: 'done' });
  it('follows the rolling order, not weekdays', () => {
    expect(nextWorkout(program, [])).toEqual({ week: 1, day: 'Upper A', programComplete: false });
    expect(nextWorkout(program, [done(1, 'Upper A')]).day).toBe('Lower A');
    // picked Upper B manually first → next is still the first undone day
    expect(nextWorkout(program, [done(1, 'Upper B')]).day).toBe('Upper A');
  });
  it('moves to the next week only when all 4 sessions are done', () => {
    const three = [done(1, 'Upper A'), done(1, 'Lower A'), done(1, 'Upper B')];
    expect(isWeekComplete(program, 1, three)).toBe(false);
    expect(currentProgramWeek(program, three)).toBe(1);
    const four = [...three, done(1, 'Lower B')];
    expect(isWeekComplete(program, 1, four)).toBe(true);
    expect(nextWorkout(program, four)).toMatchObject({ week: 2, day: 'Upper A' });
  });
  it('ignores in-progress and deleted sessions', () => {
    expect(nextWorkout(program, [{ ...done(1, 'Upper A'), status: 'in_progress' }]).day).toBe('Upper A');
    expect(nextWorkout(program, [{ ...done(1, 'Upper A'), deleted: true }]).day).toBe('Upper A');
  });
  it('reports program complete after week 20', () => {
    const all = program.weeks.flatMap((w) => days.map((d) => done(w.week, d)));
    expect(nextWorkout(program, all).programComplete).toBe(true);
  });
  it('program week on a past date', () => {
    const s = [done(1, 'Upper A', '2026-01-01'), done(1, 'Lower A', '2026-01-02'), done(1, 'Upper B', '2026-01-04'), done(1, 'Lower B', '2026-01-05'), done(2, 'Upper A', '2026-01-07')];
    expect(programWeekOn(program, s, '2026-01-03')).toBe(1);
    expect(programWeekOn(program, s, '2026-01-06')).toBe(2);
    expect(programWeekOn(program, s, '2026-01-05')).toBe(1);
  });
});

describe('nutrition', () => {
  const s = { bodyweightKg: 90, maintenanceOverride: null, kcalAdjust: 0 };
  it('maintenance = bw × 31 or override', () => {
    expect(maintenanceKcal(program, 90, null)).toBe(2790);
    expect(maintenanceKcal(program, 90, 3000)).toBe(3000);
  });
  it('cut week targets', () => {
    const t = targetsForWeek(program, s, 1);
    expect(t).toMatchObject({ kcal: 2340, protein: 180, fat: 72, phase: 'cut' });
    expect(t.carbs).toBe(Math.round((2340 - 180 * 4 - 72 * 9) / 4)); // 243
  });
  it('weeks 9, 10, 19, 20 use maintenance', () => {
    for (const w of [9, 10, 19, 20]) {
      expect(isMaintenanceWeek(program, w)).toBe(true);
      expect(targetsForWeek(program, s, w).kcal).toBe(2790);
    }
    expect(isMaintenanceWeek(program, 11)).toBe(false);
  });
  it('kcal adjustment only on cut weeks', () => {
    expect(targetsForWeek(program, { ...s, kcalAdjust: -150 }, 12).kcal).toBe(2190);
    expect(targetsForWeek(program, { ...s, kcalAdjust: -150 }, 9).kcal).toBe(2790);
  });
  it('colour status', () => {
    expect(kcalStatus(2400, 2340)).toBe('green');
    expect(kcalStatus(2540, 2340)).toBe('amber');
    expect(kcalStatus(1900, 2340)).toBe('red');
    expect(proteinStatus(175, 180)).toBe('green');
    expect(proteinStatus(150, 180)).toBe('amber');
    expect(proteinStatus(100, 180)).toBe('red');
    expect(macroStatus(250, 243)).toBe('green');
    expect(macroStatus(180, 243)).toBe('amber');
  });
  it('parses and applies adjust rules', () => {
    const r = parseAdjustRule(program.nutrition.adjust_rules[0]);
    expect(r).toMatchObject({ op: '<', pct: 0.5, consecutive: 2 });
    expect(r.advice).toMatch(/-150 kcal/);
    expect(adjustAdvice(program, [0.3])).toHaveLength(0);           // only 1 week
    expect(adjustAdvice(program, [0.4, 0.3])[0].op).toBe('<');      // 2 slow weeks
    expect(adjustAdvice(program, [0.6, 0.3])).toHaveLength(0);
    expect(adjustAdvice(program, [1.2])[0].op).toBe('>');           // too fast
    expect(adjustAdvice(program, [0.7])).toHaveLength(0);
    expect(weeklyLossPct(90, 89.55)).toBeCloseTo(0.5);
  });
  it('recipe macros spread over cooked weight', () => {
    const rice = { per100: { kcal: 360, protein: 7, carbs: 79, fat: 1 }, grams: 500 };
    const lentils = { per100: { kcal: 350, protein: 25, carbs: 60, fat: 1 }, grams: 200 };
    const r = recipeMacros([rice, lentils], 2000, 400);
    expect(r.total.kcal).toBe(2500);
    expect(r.rawWeightG).toBe(700);
    expect(r.per100.kcal).toBe(125);
    expect(r.perPlate.kcal).toBe(500);
    expect(r.perPlate.protein).toBeCloseTo((35 + 50) / 2000 * 400);
    expect(recipeMacros([rice], 0, 100).per100.kcal).toBe(360); // no cooked weight → raw weight
  });
});

describe('rules', () => {
  const pulldown = ex(1, 'Upper A', 'Wide-Grip Lat Pulldown'); // 3 × 8-10, last set ~7-8
  it('progression: +2.5 kg when all sets hit top reps at/below RPE', () => {
    const h = { date: 'x', week: 1, sets: [set(60, 10), set(60, 10), set(60, 10)], lastRpe: 8 };
    expect(progressionHint(pulldown, h)).toMatchObject({ kind: 'add_load', suggestedLoad: 62.5 });
  });
  it('progression: +1 rep when a set falls short or RPE too high', () => {
    expect(progressionHint(pulldown, { date: 'x', week: 1, sets: [set(60, 10), set(60, 9), set(60, 8)], lastRpe: 8 })?.kind).toBe('add_rep');
    expect(progressionHint(pulldown, { date: 'x', week: 1, sets: [set(60, 10), set(60, 10), set(60, 10)], lastRpe: 9.5 })?.kind).toBe('add_rep');
    expect(progressionHint(ex(1, 'Upper A', 'Barbell Bench Press'), { date: 'x', week: 1, sets: [set(80, 5)], lastRpe: 7 })).toBeNull();
  });
  it('recovery rule: two drops in a row', () => {
    const h = (l: number, r: number) => ({ date: 'x', week: 1, sets: [set(l, r)], lastRpe: null });
    expect(performanceDroppedTwice([h(100, 5), h(100, 4), h(100, 3)])).toBe(true);
    expect(performanceDroppedTwice([h(100, 5), h(100, 4), h(100, 5)])).toBe(false);
    expect(performanceDroppedTwice([h(100, 5), h(100, 4)])).toBe(false);
  });
  it('late-cut rule: weeks 15-18 and top set missing its reps', () => {
    expect(isLateCutWeek(program, 14)).toBe(false);
    expect([15, 16, 17, 18].every((w) => isLateCutWeek(program, w))).toBe(true);
    const top = ex(15, 'Lower A', 'Back Squat [Top set]'); // 1 × 3-5
    expect(topSetMissed(top, [set(130, 2)])).toBe(true);
    expect(topSetMissed(top, [set(130, 3)])).toBe(false);
    expect(topSetMissed(top, [set(130, 2, false)])).toBe(false);
  });
  it('AMRAP → new 1RM via Epley', () => {
    expect(amrapResult(140, 125, 6)).toEqual({ oldOneRm: 140, newOneRm: 150, change: 10 });
  });
});

describe('cardio', () => {
  it('picks the plan for the week', () => {
    expect(cardioPlanFor(program, 3).steps).toBe(8000);
    expect(cardioPlanFor(program, 12)).toMatchObject({ steps: 10000, liss_sessions: 3 });
    expect(cardioPlanFor(program, 16).intervals_optional).toBe(1);
  });
  it('weekly progress', () => {
    const c = (type: CardioLog['type']): CardioLog => ({ id: type, updatedAt: 0, date: 'x', type, minutes: 30, avgHr: null });
    const p = cardioProgress(cardioPlanFor(program, 1), [8000, null, 6800, 7400], [c('incline_walk'), c('intervals')]);
    expect(p).toMatchObject({ stepsAvg: 7400, stepsDays: 3, stepsTarget: 8000, lissDone: 1, lissTarget: 2, intervalsDone: 1 });
  });
  it('warns about intervals before a Lower day', () => {
    expect(intervalsWarning('intervals', 'Lower A')).toMatch(/Lower A/);
    expect(intervalsWarning('intervals', 'Upper B')).toBeNull();
    expect(intervalsWarning('bike', 'Lower B')).toBeNull();
  });
});

describe('search', () => {
  const foods = [
    { nameEn: 'Koshary', nameAr: 'كشري', aliases: ['koshari', 'kushari'] },
    { nameEn: 'Foul medames', nameAr: 'فول مدمس', aliases: ['ful'] },
    { nameEn: "Ta'meya", nameAr: 'طعمية', aliases: ['falafel'] },
    { nameEn: 'Molokhia', nameAr: 'ملوخية', aliases: [] },
  ].map((f) => ({ ...f, searchKeys: searchKeysFor(f) }));
  const first = (q: string) => searchFoods(foods, q)[0]?.nameEn;
  it('folds spelling variants', () => {
    expect(normalizeLatin('koshary')).toBe(normalizeLatin('koshari'));
    expect(normalizeLatin('foul')).toBe(normalizeLatin('ful'));
    expect(normalizeLatin("ta'meya")).toBe(normalizeLatin('taameya'));
    expect(normalizeLatin('taamiya')).toBe(normalizeLatin('tameya'));
  });
  it('finds foods in English and Arabic', () => {
    expect(first('koshary')).toBe('Koshary');
    expect(first('kosh')).toBe('Koshary');
    expect(first('كشرى')).toBe('Koshary');       // ى vs ي
    expect(first('foul')).toBe('Foul medames');
    expect(first('فول')).toBe('Foul medames');
    expect(first('taameya')).toBe("Ta'meya");
    expect(first('طعميه')).toBe("Ta'meya");      // ه vs ة
    expect(first('mulukhiyah')).toBe('Molokhia');
    expect(first('pizza')).toBeUndefined();
  });
  it('strips Arabic diacritics', () => {
    expect(tokens('فُول')).toEqual(tokens('فول'));
    expect(matchScore('', ['x'])).toBe(0);
  });
});

describe('stats', () => {
  it('7-day moving average and weekly averages', () => {
    const pts = [{ date: '2026-01-01', value: 90 }, { date: '2026-01-02', value: 89 }, { date: '2026-01-09', value: 88 }];
    const ma = movingAverage7(pts);
    expect(ma[1].value).toBe(89.5);
    expect(ma[2].value).toBe(88); // only itself inside the window
    const w = weeklyAverages('2026-01-01', pts);
    expect(w.get(1)).toBe(89.5);
    expect(w.get(2)).toBe(88);
    expect(pctChange(89.5, 88)).toBeCloseTo(-1.68, 2);
  });
  it('streaks', () => {
    const hits = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-06']);
    const hit = (d: string) => hits.has(d);
    expect(currentStreak('2026-01-06', hit)).toBe(2);
    expect(currentStreak('2026-01-07', hit)).toBe(2); // today not logged yet
    expect(currentStreak('2026-01-08', hit)).toBe(0);
    expect(bestStreak([...hits, '2026-01-04'], hit)).toBe(3);
  });
  it('weekly set volume counts done sets in done sessions', () => {
    const s = (week: number, n: number, status: 'done' | 'in_progress' = 'done') => ({ week, status, exercises: [{ key: 'a', performed: 'a', lastRpe: null, sets: Array.from({ length: n }, (_, i) => set(1, 1, i < n - 1)) }] });
    expect(weeklySetVolume([s(1, 4), s(1, 3), s(2, 5, 'in_progress')]).get(1)).toBe(5);
  });
  it('backup reminders', () => {
    const now = Date.UTC(2026, 0, 10);
    expect(daysSince(now - 3 * 86_400_000, now)).toBe(3);
    expect(backupOverdue(8)).toBe(true);
    expect(backupOverdue(7)).toBe(false);
    expect(backupOverdue(null)).toBe(true);
  });
});
