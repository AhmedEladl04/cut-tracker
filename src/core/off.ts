// Converting an Open Food Facts product into our Food shape. Pure (no network) so it is
// unit-tested. OFF data is crowd-sourced: any nutrient can be missing, strings can be
// arrays, energy can be in kJ only — so every field is handled defensively.
import { searchKeysFor } from './search';
import type { Food, Macros, Serving } from './types';

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  product_name_ar?: string;
  generic_name?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  product_quantity?: number | string;
  countries_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export interface OffConversion { food: Food; missing: (keyof Macros)[] }

export function offToFood(p: OffProduct, barcode?: string): OffConversion {
  const n = p.nutriments ?? {};
  const kj = num(n['energy-kj_100g']) || (n['energy_unit'] === 'kJ' || !n['energy_unit'] ? num(n['energy_100g']) : null);
  const kcal = num(n['energy-kcal_100g']) || (kj ? Math.round(kj / 4.184) : null);
  const values: Record<keyof Macros, number | null> = {
    kcal,
    protein: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    fat: num(n['fat_100g']),
  };
  const missing = (Object.keys(values) as (keyof Macros)[]).filter((k) => values[k] == null);
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0]?.trim();
  const code = barcode ?? p.code ?? '';
  const nameEn = (p.product_name_en || p.product_name || p.generic_name || '').trim();
  const nameAr = (p.product_name_ar || '').trim();

  const servings: Serving[] = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0) servings.push({ label: p.serving_size?.trim() || '1 serving', grams: sq });
  const pq = num(p.product_quantity);
  if (pq && pq > 0 && pq !== sq) servings.push({ label: '1 pack', grams: pq });

  const food: Food = {
    id: `off:${code}`,
    updatedAt: 0,
    nameEn: nameEn || (nameAr ? '' : `Product ${code}`),
    nameAr,
    aliases: [],
    brand: brand || undefined,
    barcode: code || undefined,
    per100: { kcal: values.kcal ?? 0, protein: values.protein ?? 0, carbs: values.carbs ?? 0, fat: values.fat ?? 0 },
    servings,
    source: 'off',
  };
  food.searchKeys = searchKeysFor(food);
  return { food, missing };
}

export const isEgyptian = (p: OffProduct) => (p.countries_tags ?? []).includes('en:egypt');
