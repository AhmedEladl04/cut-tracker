// Food diary for one day: totals vs targets, entries per meal, quick repeat of yesterday.
import { useState } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, programWeekOn, roundMacros, sumMacros, targetsForWeek, today } from '../core';
import { fmt } from '../core/format';
import type { Food, FoodLog, Meal } from '../core/types';
import { FoodLogModal, MEALS } from '../components/FoodLogModal';
import { MacroBars, toast } from '../components/ui';
import { db } from '../db/db';
import { save } from '../db/repo';
import { go, useRoute } from '../lib/router';
import { useApp } from '../lib/state';
import { program } from '../program';

export function useDayLogs(date: string) {
  return useLiveQuery(() => db.foodLogs.where('date').equals(date).filter((l) => !l.deleted).toArray(), [date]);
}

export function FoodDay() {
  const { query } = useRoute();
  const date = query.date || today();
  return <FoodDayView date={date} />;
}

export function FoodDayView({ date, embedded }: { date: string; embedded?: boolean }) {
  const { settings, sessions } = useApp();
  const logs = useDayLogs(date);
  const yesterday = useDayLogs(addDays(date, -1));
  const [editing, setEditing] = useState<{ log: FoodLog; food: Food } | null>(null);

  const week = programWeekOn(program, sessions, date);
  const target = targetsForWeek(program, settings, week);
  const total = roundMacros(sumMacros((logs ?? []).map((l) => l.macros)));
  const isToday = date === today();

  async function openLog(log: FoodLog) {
    const food = await db.foods.get(log.foodId);
    // If the food was deleted, edit using the numbers stored on the log.
    const f: Food = food ?? {
      id: log.foodId, updatedAt: 0, nameEn: log.name, nameAr: '', aliases: [], servings: [], source: 'manual',
      per100: log.grams > 0 ? roundMacros({ kcal: log.macros.kcal * 100 / log.grams, protein: log.macros.protein * 100 / log.grams, carbs: log.macros.carbs * 100 / log.grams, fat: log.macros.fat * 100 / log.grams }, 2) : log.macros,
    };
    setEditing({ log, food: f });
  }

  async function repeatYesterday(meal: Meal) {
    const prev = (yesterday ?? []).filter((l) => l.meal === meal);
    for (const l of prev) {
      const { id: _id, updatedAt: _u, ...rest } = l;
      await save('foodLogs', { ...rest, date });
    }
    toast(`Copied ${prev.length} item(s) from yesterday`);
  }

  return (
    <>
      {!embedded && (
        <div class="row between">
          <button class="small" onClick={() => go('/food', { date: addDays(date, -1) })} aria-label="Previous day">‹</button>
          <div class="center">
            <h1 style={{ margin: 0 }}>{isToday ? 'Today' : date}</h1>
            <div class="small muted">Week {week} · <span class={`pill ${target.phase}`}>{target.phase}</span> target {target.kcal} kcal</div>
          </div>
          <button class="small" onClick={() => go('/food', { date: addDays(date, 1) })} disabled={isToday} aria-label="Next day">›</button>
        </div>
      )}

      <div class="card"><MacroBars total={total} target={target} inProgress={isToday} /></div>

      {!embedded && (
        <div class="row">
          <button class="grow" onClick={() => go('/food/scan', { date })}>📷 Scan</button>
          <button class="grow" onClick={() => go('/food/recipe')}>🍲 New recipe</button>
        </div>
      )}

      {MEALS.map((m) => {
        const items = (logs ?? []).filter((l) => l.meal === m.id);
        const sub = roundMacros(sumMacros(items.map((l) => l.macros)));
        const canRepeat = (yesterday ?? []).some((l) => l.meal === m.id);
        return (
          <section class="card" key={m.id}>
            <div class="row between">
              <h3>{m.label}</h3>
              <span class="small muted">{sub.kcal} kcal · P {fmt(sub.protein, 0)}</span>
            </div>
            <ul class="list">
              {items.map((l) => (
                <li class="tap" key={l.id} onClick={() => openLog(l)}>
                  <span class="grow"><bdi dir="auto" class="name">{l.name}</bdi>
                    <span class="small muted"> · {l.servingLabel ? `${fmt(l.servings ?? 1)} × ${l.servingLabel}` : `${fmt(l.grams, 0)} g`}</span>
                  </span>
                  <span class="small nowrap">{Math.round(l.macros.kcal)} kcal</span>
                </li>
              ))}
            </ul>
            <div class="row">
              <button class="small grow" onClick={() => go('/food/search', { meal: m.id, date })}>+ Add</button>
              {canRepeat && items.length === 0 && <button class="small grow" onClick={() => repeatYesterday(m.id)}>↻ Yesterday's {m.label.toLowerCase()}</button>}
            </div>
          </section>
        );
      })}

      {editing && <FoodLogModal food={editing.food} existing={editing.log} date={date} meal={editing.log.meal} onClose={() => setEditing(null)} />}
    </>
  );
}
