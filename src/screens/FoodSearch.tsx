// Find a food to log: local foods first (offline), then Open Food Facts when online.
import { useMemo, useState } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { searchFoods, today } from '../core';
import { fmt } from '../core/format';
import type { OffConversion } from '../core/off';
import type { Food, Meal } from '../core/types';
import { FoodLogModal, MEALS } from '../components/FoodLogModal';
import { FoodName } from '../components/ui';
import { db } from '../db/db';
import { alive } from '../db/repo';
import { go, useRoute } from '../lib/router';
import { searchOff } from '../lib/off';
import { cacheOffFood } from './Scanner';

export function FoodRow({ food, onClick, right }: { food: Food; onClick: () => void; right?: preact.ComponentChildren }) {
  return (
    <li class="tap" onClick={onClick}>
      <span class="grow">
        <FoodName en={food.nameEn} ar={food.nameAr} brand={food.brand} />
        <div class="small muted">
          {fmt(food.per100.kcal, 0)} kcal · P {fmt(food.per100.protein)} /100 g
          {food.source === 'estimate' && ' · est.'}
          {food.source === 'recipe' && ' · recipe'}
          {food.favourite && ' · ★'}
        </div>
      </span>
      {right}
    </li>
  );
}

export function FoodSearch() {
  const { query } = useRoute();
  const meal = (query.meal as Meal) || 'snack';
  const date = query.date || today();
  const [q, setQ] = useState(query.q ?? '');
  const [picked, setPicked] = useState<Food | null>(null);
  const [online, setOnline] = useState<{ loading: boolean; results: OffConversion[] | null; error: string | null }>({ loading: false, results: null, error: null });

  const foods = useLiveQuery(() => db.foods.toArray().then(alive), []);
  const results = useMemo(() => (foods && q.trim() ? searchFoods(foods, q, 50) : []), [foods, q]);
  const favourites = useMemo(() => (foods ?? []).filter((f) => f.favourite).slice(0, 30), [foods]);
  const recent = useMemo(() => (foods ?? []).filter((f) => f.lastUsedAt && !f.favourite).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 15), [foods]);
  const recipes = useMemo(() => (foods ?? []).filter((f) => f.source === 'recipe'), [foods]);

  async function searchOnline() {
    setOnline({ loading: true, results: null, error: null });
    try {
      setOnline({ loading: false, results: await searchOff(q), error: null });
    } catch (e) {
      setOnline({ loading: false, results: null, error: e instanceof Error ? (e.message === 'offline' ? 'You are offline. Add the food manually instead.' : e.message) : 'Error' });
    }
  }

  async function pickOnline(c: OffConversion) {
    const food = await cacheOffFood(c);
    if (c.missing.length) go('/food/edit', { id: food.id, missing: c.missing.join(','), meal, date });
    else setPicked(food);
  }

  const mealLabel = MEALS.find((m) => m.id === meal)?.label;

  return (
    <>
      <div class="row between">
        <h1>Add to {mealLabel}</h1>
        <a href={`#/food?date=${date}`} class="btn small">Done</a>
      </div>
      <input
        type="search" autoFocus placeholder="Search: koshary, فول, juhayna…" value={q} dir="auto"
        onInput={(e) => { setQ((e.target as HTMLInputElement).value); setOnline({ loading: false, results: null, error: null }); }}
      />
      <div class="row" style={{ marginTop: 8 }}>
        <button class="grow small" onClick={() => go('/food/scan', { meal, date })}>📷 Scan barcode</button>
        <button class="grow small" onClick={() => go('/food/edit', { meal, date, name: q })}>＋ New food</button>
        <button class="grow small" onClick={() => go('/food/recipe')}>🍲 Recipe</button>
      </div>

      {q.trim() ? (
        <>
          <div class="card">
            <div class="small muted">My foods ({results.length})</div>
            <ul class="list">{results.map((f) => <FoodRow key={f.id} food={f} onClick={() => setPicked(f)} />)}</ul>
            {results.length === 0 && <p class="small muted">Nothing found locally.</p>}
          </div>
          <div class="card">
            <div class="row between">
              <span class="small muted">Packaged products — Open Food Facts</span>
              <button class="small" disabled={online.loading || q.trim().length < 2} onClick={searchOnline}>{online.loading ? 'Searching…' : 'Search online'}</button>
            </div>
            {online.error && <p class="small" style={{ color: 'var(--amber)' }}>{online.error}</p>}
            {online.results && online.results.length === 0 && <p class="small muted">No products found. Try the barcode, or add it manually.</p>}
            {online.results && (
              <ul class="list">
                {online.results.map((c) => (
                  <FoodRow key={c.food.id} food={c.food} onClick={() => pickOnline(c)}
                    right={c.missing.length ? <span class="pill estimate">incomplete</span> : undefined} />
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          {favourites.length > 0 && <div class="card"><div class="small muted">★ Favourites</div><ul class="list">{favourites.map((f) => <FoodRow key={f.id} food={f} onClick={() => setPicked(f)} />)}</ul></div>}
          {recent.length > 0 && <div class="card"><div class="small muted">Recent</div><ul class="list">{recent.map((f) => <FoodRow key={f.id} food={f} onClick={() => setPicked(f)} />)}</ul></div>}
          {recipes.length > 0 && <div class="card"><div class="small muted">My recipes</div><ul class="list">{recipes.map((f) => <FoodRow key={f.id} food={f} onClick={() => setPicked(f)} />)}</ul></div>}
          {favourites.length + recent.length === 0 && <p class="muted small">Type to search {foods?.length ?? 0} foods (Arabic or English). Tap ☆ when logging to add favourites.</p>}
        </>
      )}

      {picked && <FoodLogModal food={picked} date={date} meal={meal} onClose={() => setPicked(null)} />}
    </>
  );
}
