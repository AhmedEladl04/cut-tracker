import { describe, expect, it } from 'vitest';
import { changedSince, csvCell, foodCsv, lwwWinners, makeBackup, parseBackup, toCsv, weightCsv, workoutsCsv } from './backup';
import type { FoodLog, Session } from './types';

const r = (id: string, updatedAt: number, extra = {}) => ({ id, updatedAt, ...extra });

describe('last-write-wins merge', () => {
  it('keeps the newer version per id', () => {
    const local = [r('a', 10, { v: 'old' }), r('b', 50, { v: 'local' })];
    const incoming = [r('a', 20, { v: 'new' }), r('b', 40, { v: 'stale' }), r('c', 5, { v: 'added' })];
    expect(lwwWinners(local, incoming).map((x) => x.id).sort()).toEqual(['a', 'c']);
  });
  it('a newer delete tombstone wins over an older edit', () => {
    expect(lwwWinners([r('a', 10)], [r('a', 11, { deleted: true })])[0]).toMatchObject({ deleted: true });
  });
  it('duplicates in incoming: newest wins', () => {
    expect(lwwWinners([], [r('a', 1, { v: 1 }), r('a', 3, { v: 3 }), r('a', 2, { v: 2 })])).toEqual([r('a', 3, { v: 3 })]);
  });
  it('changedSince', () => {
    expect(changedSince([r('a', 1), r('b', 5)], 2).map((x) => x.id)).toEqual(['b']);
  });
});

describe('backup file', () => {
  it('round-trips', () => {
    const b = makeBackup({ foods: [r('x', 1)] }, new Date('2026-01-01T00:00:00Z'));
    expect(parseBackup(JSON.parse(JSON.stringify(b)), ['foods'])).toEqual(b);
  });
  it('rejects foreign or broken files', () => {
    expect(() => parseBackup({ hello: 1 }, ['foods'])).toThrow(/not a Cut Tracker backup/);
    expect(() => parseBackup({ app: 'cut-tracker', version: 1, tables: { pizza: [] } }, ['foods'])).toThrow(/Unknown table/);
    expect(() => parseBackup({ app: 'cut-tracker', version: 1, tables: { foods: [{ id: 1 }] } }, ['foods'])).toThrow(/invalid records/);
    expect(() => parseBackup({ app: 'cut-tracker', version: 99, tables: {} }, ['foods'])).toThrow(/newer version/);
  });
});

describe('CSV', () => {
  it('escapes cells and adds a BOM for Excel', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['x'], [[1]])).toBe('﻿x\r\n1\r\n');
  });
  it('workouts: one row per set, RPE on the last set', () => {
    const s: Session = { id: 's', updatedAt: 1, week: 1, day: 'Upper A', date: '2026-01-01', startedAt: 0, finishedAt: 1, durationMin: 60, status: 'done',
      exercises: [{ key: 'Row', performed: 'Row', lastRpe: 8, sets: [{ load: 60, reps: 10, done: true }, { load: 60, reps: 9, done: true }] }] };
    const lines = workoutsCsv([s]).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('2026-01-01,1,Upper A,done,60,Row,Row,2,60,9,1,8');
  });
  it('food and weight, Arabic kept', () => {
    const l: FoodLog = { id: 'l', updatedAt: 1, date: '2026-01-01', meal: 'lunch', foodId: 'f', name: 'كشري', grams: 450, servingLabel: 'medium plate', servings: 1, macros: { kcal: 765, protein: 22.5, carbs: 135, fat: 15.75 } };
    expect(foodCsv([l])).toContain('2026-01-01,lunch,كشري,450,medium plate,1,765,22.5,135.0,15.8');
    expect(weightCsv([{ id: '2026-01-02', updatedAt: 1, weightKg: 89.5 }, { id: '2026-01-01', updatedAt: 1, weightKg: 90, deleted: true }])).toContain('2026-01-02,89.5,,');
  });
});
