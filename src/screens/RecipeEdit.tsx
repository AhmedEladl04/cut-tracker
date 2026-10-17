// Recipe builder: ingredients with raw weights + total cooked weight → macros per 100 g
// and per plate. Saving creates/updates a Food (source "recipe") you can log like any other.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { recipeMacros, roundMacros, searchFoods } from '../core';
import { fmt } from '../core/format';
import type { Recipe, RecipeIngredient } from '../core/types';
import { Field, NumInput, toast } from '../components/ui';
import { db, newId } from '../db/db';
import { alive, remove, save } from '../db/repo';
import { back, useRoute } from '../lib/router';
import { FoodRow } from './FoodSearch';

type Draft = Omit<Recipe, 'updatedAt'> & { nameAr: string };

export function RecipeEdit() {
  const { query } = useRoute();
  const [r, setR] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const foods = useLiveQuery(() => db.foods.toArray().then(alive), []);

  useEffect(() => {
    (async () => {
      let rec: Recipe | undefined;
      if (query.id) rec = await db.recipes.get(query.id);
      else if (query.food) rec = await db.recipes.filter((x) => x.foodId === query.food && !x.deleted).first();
      const food = rec ? await db.foods.get(rec.foodId) : undefined;
      setR(rec ? { ...rec, nameAr: food?.nameAr ?? '' } : { id: '', name: '', nameAr: '', ingredients: [], cookedWeightG: 0, plateG: 350, foodId: '' });
    })();
  }, [query.id, query.food]);

  // Hide recipes from their own ingredient search to avoid a recipe containing itself.
  const results = useMemo(() => (foods && q.trim() ? searchFoods(foods.filter((f) => f.id !== r?.foodId), q, 15) : []), [foods, q, r?.foodId]);
  if (!r) return null;
  const rec: Draft = r; // non-null copy for the async handlers below

  const set = (patch: Partial<Draft>) => setR({ ...r, ...patch });
  const setIng = (i: number, patch: Partial<RecipeIngredient>) => set({ ingredients: r.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const calc = recipeMacros(r.ingredients, r.cookedWeightG, r.plateG);
  const per100 = roundMacros(calc.per100);
  const perPlate = roundMacros(calc.perPlate);
  const valid = r.name.trim() && r.ingredients.length > 0 && r.ingredients.every((i) => i.grams > 0);

  async function submit() {
    if (!valid) return;
    const foodId = rec.foodId || newId();
    const cooked = rec.cookedWeightG > 0 ? rec.cookedWeightG : calc.rawWeightG;
    const existingFood = await db.foods.get(foodId);
    await save('foods', {
      id: foodId, nameEn: rec.name.trim(), nameAr: rec.nameAr.trim(), aliases: existingFood?.aliases ?? [],
      per100: roundMacros(calc.per100, 2), source: 'recipe', favourite: existingFood?.favourite,
      servings: [{ label: '1 plate', grams: rec.plateG }, { label: 'whole pot', grams: cooked }],
    });
    await save('recipes', { id: rec.id || undefined, name: rec.name.trim(), ingredients: rec.ingredients, cookedWeightG: cooked, plateG: rec.plateG, foodId });
    toast('Recipe saved — find it in food search');
    back();
  }

  async function del() {
    if (!rec.id || !confirm('Delete this recipe and its food?')) return;
    await remove('recipes', rec.id);
    if (rec.foodId) await remove('foods', rec.foodId);
    back();
  }

  return (
    <>
      <h1>{r.id ? 'Edit recipe' : 'New recipe'}</h1>
      <Field label="Name"><input value={r.name} placeholder="e.g. Mum's koshary" onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="الاسم (optional)"><input dir="rtl" value={r.nameAr} onInput={(e) => set({ nameAr: (e.target as HTMLInputElement).value })} /></Field>

      <h2>Ingredients (raw weights)</h2>
      {r.ingredients.map((ing, i) => (
        <div class="row" key={i} style={{ marginBottom: 6 }}>
          <bdi class="grow name small" dir="auto">{ing.name}</bdi>
          <div style={{ width: 90 }}><NumInput value={ing.grams || null} onChange={(v) => setIng(i, { grams: v ?? 0 })} placeholder="g" /></div>
          <span class="small muted" style={{ width: 54, textAlign: 'right' }}>{fmt(ing.per100.kcal * ing.grams / 100, 0)} kcal</span>
          <button class="ghost" onClick={() => set({ ingredients: r.ingredients.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
        </div>
      ))}
      <input type="search" dir="auto" placeholder="+ Add ingredient: rice, lentils, عدس…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {results.length > 0 && (
        <ul class="list card" style={{ padding: '0 12px' }}>
          {results.map((f) => (
            <FoodRow key={f.id} food={f} onClick={() => {
              set({ ingredients: [...r.ingredients, { foodId: f.id, name: f.nameEn || f.nameAr, grams: 100, per100: f.per100 }] });
              setQ('');
            }} />
          ))}
        </ul>
      )}

      <div class="grid2">
        <Field label="Total cooked weight (g)" hint={`Weigh the pot contents. Raw total: ${fmt(calc.rawWeightG, 0)} g`}>
          <NumInput value={r.cookedWeightG || null} onChange={(v) => set({ cookedWeightG: v ?? 0 })} placeholder={String(calc.rawWeightG || '')} />
        </Field>
        <Field label="One plate (g)">
          <NumInput value={r.plateG || null} onChange={(v) => set({ plateG: v ?? 0 })} />
        </Field>
      </div>

      <div class="card info">
        <div class="small muted">Whole recipe: {fmt(calc.total.kcal, 0)} kcal · P {fmt(calc.total.protein, 0)} g</div>
        <div><b>Per 100 g:</b> {per100.kcal} kcal · P {per100.protein} · C {per100.carbs} · F {per100.fat}</div>
        <div><b>Per plate ({fmt(r.plateG, 0)} g):</b> {perPlate.kcal} kcal · P {perPlate.protein} · C {perPlate.carbs} · F {perPlate.fat}</div>
      </div>

      <div class="stack">
        <button class="primary block" disabled={!valid} onClick={submit}>Save recipe</button>
        {r.id && <button class="danger block" onClick={del}>Delete recipe</button>}
      </div>
    </>
  );
}
