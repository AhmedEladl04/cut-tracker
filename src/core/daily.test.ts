import { describe, expect, it } from 'vitest';
import programJson from '../../program.json';
import { adjustAdvice } from './nutrition';
import { checkinRows, dayTicks, trailingCutLosses } from './daily';
import type { Program } from './types';

const program = programJson as unknown as Program;

describe('day ticks', () => {
  const t = { kcal: 2340, protein: 180, steps: 8000 };
  const base = { date: '2026-01-01', workoutDone: true, kcal: 2400, protein: 175, steps: 8200, cardioCount: 1, weightLogged: true };
  it('all hit', () => {
    expect(dayTicks(base, t)).toEqual({ workout: true, calories: true, protein: true, steps: true, cardio: true, weight: true });
  });
  it('misses', () => {
    expect(dayTicks({ ...base, kcal: 2500, protein: 150, steps: 7999, workoutDone: false, cardioCount: 0, weightLogged: false }, t))
      .toEqual({ workout: false, calories: false, protein: false, steps: false, cardio: false, weight: false });
  });
  it('no food logged ≠ calories hit', () => {
    expect(dayTicks({ ...base, kcal: null, protein: 0 }, { ...t, kcal: 0, protein: 0 }).calories).toBe(false);
  });
});

describe('weekly check-in', () => {
  const start = '2026-01-01';
  const w = (date: string, value: number) => ({ date, value });
  const weights = [w('2026-01-01', 90), w('2026-01-03', 90), w('2026-01-08', 89.8), w('2026-01-15', 89.6), w('2026-01-22', 88.4)];
  it('averages and loss % per calendar week', () => {
    const rows = checkinRows(start, '2026-01-29', weights, [w('2026-01-02', 92), w('2026-01-09', 91)], () => true);
    expect(rows.map((r) => r.avg)).toEqual([90, 89.8, 89.6, 88.4, null]);
    expect(rows[1].lossPct).toBeCloseTo(0.22, 2);
    expect(rows[0].waist).toBe(92);
    expect(rows[4].complete).toBe(false);
    expect(rows[3].complete).toBe(true);
  });
  it('advice: two slow cut weeks → -150 kcal; fast week → +kcal; maintenance weeks break the run', () => {
    const slow = checkinRows(start, '2026-01-22', weights.slice(0, 4), [], () => true);
    const losses = trailingCutLosses(slow);
    expect(losses).toHaveLength(2);
    expect(adjustAdvice(program, losses)[0].advice).toMatch(/-150 kcal/);
    const fast = checkinRows(start, '2026-01-29', weights, [], () => true);
    expect(adjustAdvice(program, trailingCutLosses(fast)).map((r) => r.op)).toEqual(['>']);
    const maint = checkinRows(start, '2026-01-22', weights.slice(0, 4), [], (wk) => wk !== 3);
    expect(trailingCutLosses(maint)).toEqual([]);
  });
});
