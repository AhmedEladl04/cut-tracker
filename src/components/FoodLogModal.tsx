// Bottom sheet to log a food (or edit an existing log): by serving or by grams, per meal.
import { useState } from 'preact/hooks';
import { roundMacros, scaleMacros } from '../core/nutrition';
import { fmt } from '../core/format';
import type { Food, FoodLog, Meal } from '../core/types';
import { remove, save } from '../db/repo';
import { go } from '../lib/router';
import { FoodName, Modal, NumInput, toast } from './ui';

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

export function FoodLogModal(props: { food: Food; date: string; meal: Meal; existing?: FoodLog; onClose: () => void; onSaved?: () => void }) {
  const { food, existing } = props;
  const servings = food.servings ?? [];
  // Start from the existing log, else 1 × first serving, else 100 g.
  const initialServing = existing ? (existing.servingLabel ? servings.findIndex((s) => s.label === existing.servingLabel) : -1) : servings.length ? 0 : -1;
  const [servingIdx, setServingIdx] = useState<number>(initialServing); // -1 = grams
  const [count, setCount] = useState<number | null>(existing?.servings ?? 1);
  const [grams, setGrams] = useState<number | null>(existing?.grams ?? (servings[0]?.grams ?? 100));
  const [meal, setMeal] = useState<Meal>(existing?.meal ?? props.meal);
  const [fav, setFav] = useState(!!food.favourite);

  const totalGrams = servingIdx >= 0 ? (count ?? 0) * servings[servingIdx].grams : grams ?? 0;
  const m = roundMacros(scaleMacros(food.per100, totalGrams));

  async function submit() {
    if (totalGrams <= 0) return;
    await save('foodLogs', {
      id: existing?.id,
      date: existing?.date ?? props.date,
      meal,
      foodId: food.id,
      name: food.nameEn || food.nameAr,
      grams: Math.round(totalGrams * 10) / 10,
      servingLabel: servingIdx >= 0 ? servings[servingIdx].label : null,
      servings: servingIdx >= 0 ? count : null,
      macros: m,
    });
    await save('foods', { ...food, lastUsedAt: Date.now(), favourite: fav });
    toast(existing ? 'Updated' : `Logged ${fmt(totalGrams, 0)} g`);
    props.onSaved?.();
    props.onClose();
  }

  async function del() {
    if (!existing) return;
    await remove('foodLogs', existing.id);
    props.onClose();
  }

  return (
    <Modal title={existing ? 'Edit entry' : 'Log food'} onClose={props.onClose}>
      <div class="row between" style={{ marginTop: 6 }}>
        <div class="grow"><FoodName en={food.nameEn} ar={food.nameAr} brand={food.brand} /></div>
        <button class="ghost" style={{ fontSize: 22 }} onClick={() => setFav(!fav)} aria-label="Favourite">{fav ? '★' : '☆'}</button>
      </div>
      <div class="small muted">
        per 100 g: {fmt(food.per100.kcal, 0)} kcal · P {fmt(food.per100.protein)} · C {fmt(food.per100.carbs)} · F {fmt(food.per100.fat)}
        {food.source === 'estimate' && <> · <span class="pill estimate">estimate</span></>}
      </div>

      <label>Amount</label>
      <div class="chips">
        {servings.map((s, i) => (
          <button key={s.label} class={`chip ${servingIdx === i ? 'on' : ''}`} onClick={() => setServingIdx(i)}>{s.label} ({fmt(s.grams, 0)} g)</button>
        ))}
        <button class={`chip ${servingIdx === -1 ? 'on' : ''}`} onClick={() => { setGrams(Math.round(totalGrams) || 100); setServingIdx(-1); }}>grams</button>
      </div>
      {servingIdx >= 0 ? (
        <div class="row">
          <button class="small" onClick={() => setCount(Math.max(0.5, (count ?? 1) - 0.5))}>−½</button>
          <NumInput value={count} onChange={setCount} />
          <button class="small" onClick={() => setCount((count ?? 0) + 0.5)}>+½</button>
          <span class="muted nowrap">× {servings[servingIdx].label}</span>
        </div>
      ) : (
        <div class="row"><NumInput value={grams} onChange={setGrams} /><span class="muted">g</span></div>
      )}

      <label>Meal</label>
      <div class="seg">
        {MEALS.map((x) => <button key={x.id} class={meal === x.id ? 'on' : ''} onClick={() => setMeal(x.id)}>{x.label}</button>)}
      </div>

      <div class="card" style={{ marginTop: 12 }}>
        <div class="grid3 center" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div><div class="big-num" style={{ fontSize: 22 }}>{m.kcal}</div><div class="small muted">kcal</div></div>
          <div><div class="big-num" style={{ fontSize: 22 }}>{fmt(m.protein, 0)}</div><div class="small muted">protein</div></div>
          <div><div class="big-num" style={{ fontSize: 22 }}>{fmt(m.carbs, 0)}</div><div class="small muted">carbs</div></div>
          <div><div class="big-num" style={{ fontSize: 22 }}>{fmt(m.fat, 0)}</div><div class="small muted">fat</div></div>
        </div>
        <div class="small muted center">{fmt(totalGrams, 0)} g</div>
      </div>

      <div class="stack">
        <button class="primary block" disabled={totalGrams <= 0} onClick={submit}>{existing ? 'Save' : 'Add to log'}</button>
        <div class="row">
          <button class="grow small" onClick={() => { props.onClose(); go('/food/edit', { id: food.id }); }}>Edit food</button>
          {existing && <button class="danger grow small" onClick={del}>Delete entry</button>}
        </div>
      </div>
    </Modal>
  );
}
