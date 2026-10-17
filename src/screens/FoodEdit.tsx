// Create or edit a food: names (Arabic + English), macros per 100 g, serving sizes.
// Also used for "barcode not found" (prefilled with the barcode) and for completing
// Open Food Facts products that have missing nutrients.
import { useEffect, useState } from 'preact/hooks';
import { fmt } from '../core/format';
import type { Food, Macros, Serving } from '../core/types';
import { Field, NumInput, toast } from '../components/ui';
import { db } from '../db/db';
import { remove, save } from '../db/repo';
import { back, go, useRoute } from '../lib/router';

const MACROS: { k: keyof Macros; label: string }[] = [
  { k: 'kcal', label: 'Calories (kcal)' }, { k: 'protein', label: 'Protein (g)' },
  { k: 'carbs', label: 'Carbs (g)' }, { k: 'fat', label: 'Fat (g)' },
];

export function FoodEdit() {
  const { query } = useRoute();
  const [food, setFood] = useState<Food | null>(null);
  const [notFound, setNotFound] = useState(false);
  const missing = (query.missing ?? '').split(',').filter(Boolean);

  useEffect(() => {
    (async () => {
      if (query.id) {
        const f = await db.foods.get(query.id);
        if (f) setFood(f); else setNotFound(true);
      } else {
        setFood({
          id: '', updatedAt: 0, nameEn: query.name ?? '', nameAr: '', aliases: [], barcode: query.barcode || undefined,
          per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, servings: [], source: 'manual',
        });
      }
    })();
  }, [query.id]);

  if (notFound) return <p class="muted">Food not found.</p>;
  if (!food) return null;
  const cur: Food = food; // non-null copy for the async handlers below
  const set = (patch: Partial<Food>) => setFood({ ...food, ...patch });
  const setMacro = (k: keyof Macros, v: number | null) => set({ per100: { ...food.per100, [k]: v ?? 0 } });
  const setServing = (i: number, patch: Partial<Serving>) => set({ servings: food.servings.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const atwater = food.per100.protein * 4 + food.per100.carbs * 4 + food.per100.fat * 9;
  const valid = (food.nameEn.trim() || food.nameAr.trim()) && food.per100.kcal > 0;

  async function submit() {
    if (!valid) return;
    const { id, updatedAt: _u, ...rest } = cur;
    const saved = await save('foods', {
      ...rest,
      id: id || undefined,
      servings: cur.servings.filter((s) => s.label.trim() && s.grams > 0),
    });
    toast('Food saved');
    if (query.meal) go('/food/search', { meal: query.meal, date: query.date, q: saved.nameEn });
    else back();
  }

  async function del() {
    if (!cur.id || !confirm('Delete this food? Past logs keep their numbers.')) return;
    await remove('foods', cur.id);
    back();
  }

  return (
    <>
      <h1>{food.id ? 'Edit food' : 'New food'}</h1>
      {query.barcode && !query.id && <div class="card info small">Barcode <b>{query.barcode}</b> wasn't found{navigator.onLine ? '' : ' (offline)'}. Type the values from the label once — it's saved on your phone for next time.</div>}
      {missing.length > 0 && <div class="card warn small">Open Food Facts is missing: <b>{missing.join(', ')}</b>. Please fill them in from the label.</div>}
      {food.source === 'estimate' && <div class="card warn small">These values are <b>estimates</b> for a typical home/restaurant portion. Adjust them if you know better.</div>}

      <Field label="Name (English)"><input value={food.nameEn} onInput={(e) => set({ nameEn: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="الاسم (Arabic)"><input dir="rtl" value={food.nameAr} onInput={(e) => set({ nameAr: (e.target as HTMLInputElement).value })} /></Field>
      <div class="grid2">
        <Field label="Brand"><input value={food.brand ?? ''} onInput={(e) => set({ brand: (e.target as HTMLInputElement).value || undefined })} /></Field>
        <Field label="Barcode"><input inputMode="numeric" value={food.barcode ?? ''} onInput={(e) => set({ barcode: (e.target as HTMLInputElement).value || undefined })} /></Field>
      </div>
      <Field label="Other spellings (comma separated)" hint="Helps search, e.g. koshari, كشري">
        <input dir="auto" value={food.aliases.join(', ')} onInput={(e) => set({ aliases: (e.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean) })} />
      </Field>

      <h2>Per 100 g</h2>
      <div class="grid2">
        {MACROS.map((m) => (
          <Field key={m.k} label={m.label}>
            <NumInput value={food.per100[m.k] || (missing.includes(m.k) ? null : food.per100[m.k])} onChange={(v) => setMacro(m.k, v)} />
          </Field>
        ))}
      </div>
      {food.per100.kcal > 0 && Math.abs(atwater - food.per100.kcal) / food.per100.kcal > 0.2 && (
        <p class="small" style={{ color: 'var(--amber)' }}>Check: macros add up to ~{fmt(atwater, 0)} kcal, not {fmt(food.per100.kcal, 0)}.</p>
      )}
      <label class="row" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={food.source === 'estimate'} onChange={(e) => set({ source: (e.target as HTMLInputElement).checked ? 'estimate' : food.source === 'estimate' ? 'manual' : food.source })} />
        Values are estimates
      </label>

      <h2>Serving sizes</h2>
      {food.servings.map((s, i) => (
        <div class="row" key={i} style={{ marginBottom: 6 }}>
          <input class="grow" placeholder="e.g. 1 plate" value={s.label} onInput={(e) => setServing(i, { label: (e.target as HTMLInputElement).value })} />
          <div style={{ width: 90 }}><NumInput value={s.grams || null} onChange={(v) => setServing(i, { grams: v ?? 0 })} placeholder="g" /></div>
          <button class="ghost" onClick={() => set({ servings: food.servings.filter((_, j) => j !== i) })} aria-label="Remove serving">✕</button>
        </div>
      ))}
      <button class="small" onClick={() => set({ servings: [...food.servings, { label: '', grams: 0 }] })}>+ Add serving</button>

      <div class="stack" style={{ marginTop: 20 }}>
        <button class="primary block" disabled={!valid} onClick={submit}>Save food</button>
        {food.id && food.source === 'recipe' && <a class="btn block" href={`#/food/recipe?food=${encodeURIComponent(food.id)}`}>Edit recipe ingredients</a>}
        {food.id && <button class="danger block" onClick={del}>Delete food</button>}
      </div>
    </>
  );
}
