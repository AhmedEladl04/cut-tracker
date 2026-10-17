import { describe, expect, it } from 'vitest';
import seed from '../../foods_seed_eg.json';
import { offToFood, isEgyptian } from './off';
import { searchFoods, searchKeysFor } from './search';

const foods = seed.foods.map((f) => ({ ...f, searchKeys: searchKeysFor(f) }));
const top = (q: string) => searchFoods(foods, q, 5).map((f) => f.id);

describe('seed foods file', () => {
  it('has ~120+ complete items, all marked as estimates', () => {
    expect(foods.length).toBeGreaterThanOrEqual(120);
    for (const f of seed.foods) {
      expect(f.source).toBe('estimate');
      expect(f.nameEn && f.nameAr).toBeTruthy();
      expect(f.per100.kcal).toBeGreaterThanOrEqual(0);
      expect(f.servings.length).toBeGreaterThan(0);
    }
    expect(new Set(seed.foods.map((f) => f.id)).size).toBe(seed.foods.length);
  });
  it.each([
    ['koshary', 'koshary'], ['koshari', 'koshary'], ['كشري', 'koshary'],
    ['foul', 'foul-medames-plain'], ['ful', 'foul-medames-plain'], ['فول', 'foul-medames-plain'],
    ["ta'meya", 'ta-meya-egyptian-falafel'], ['taameya', 'ta-meya-egyptian-falafel'], ['طعمية', 'ta-meya-egyptian-falafel'],
    ['molokheya', 'molokhia'], ['baladi', 'baladi-bread-aish-baladi'], ['عيش بلدي', 'baladi-bread-aish-baladi'],
    ['gebna areesh', 'gebna-areesh-cottage-cheese'], ['basbosa', 'basbousa'], ['قصب', 'sugarcane-juice'],
  ])('"%s" finds %s', (q, id) => {
    expect(top(q)).toContain(id);
  });
});

describe('Open Food Facts conversion', () => {
  it('maps a complete product', () => {
    const { food, missing } = offToFood({
      code: '6223000350065', product_name: 'Juhayna full cream milk', product_name_ar: 'لبن جهينة', brands: 'Juhayna,Other',
      serving_size: '250 ml', serving_quantity: 250, product_quantity: '1000', countries_tags: ['en:egypt'],
      nutriments: { 'energy-kcal_100g': 57, proteins_100g: 3, carbohydrates_100g: 4.5, fat_100g: 3 },
    });
    expect(missing).toEqual([]);
    expect(food).toMatchObject({ id: 'off:6223000350065', brand: 'Juhayna', barcode: '6223000350065', source: 'off', nameAr: 'لبن جهينة' });
    expect(food.per100).toEqual({ kcal: 57, protein: 3, carbs: 4.5, fat: 3 });
    expect(food.servings).toEqual([{ label: '250 ml', grams: 250 }, { label: '1 pack', grams: 1000 }]);
  });
  it('derives kcal from kJ and reports missing nutrients', () => {
    const { food, missing } = offToFood({ code: '1', product_name: 'X', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: '2' } });
    expect(food.per100.kcal).toBe(100);
    expect(food.per100.protein).toBe(2);
    expect(missing).toEqual(['carbs', 'fat']);
  });
  it('handles empty products', () => {
    const { food, missing } = offToFood({}, '999');
    expect(food.nameEn).toBe('Product 999');
    expect(missing).toHaveLength(4);
    expect(isEgyptian({ countries_tags: ['en:france'] })).toBe(false);
  });
});
