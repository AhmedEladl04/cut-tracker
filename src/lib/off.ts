// Open Food Facts API calls, made directly from the phone's browser when online.
//
// Their rules: identify the app, stay under 15 product lookups/min and 10 searches/min.
// Browsers don't allow JavaScript to set the User-Agent header, so we identify ourselves
// with the app_name / app_version query parameters, and we throttle requests here.
import { isEgyptian, offToFood, type OffConversion, type OffProduct } from '../core/off';

const APP_NAME = 'CutTracker-PWA';
const APP_VERSION = '1.0';
const FIELDS = 'code,product_name,product_name_en,product_name_ar,generic_name,brands,serving_size,serving_quantity,product_quantity,countries_tags,nutriments';
const ident = `app_name=${APP_NAME}&app_version=${APP_VERSION}`;

// ---- simple client-side rate limiter ----
const calls: Record<'product' | 'search', number[]> = { product: [], search: [] };
const LIMIT = { product: 12, search: 8 }; // a bit below OFF's 15 / 10 per minute
function allow(kind: 'product' | 'search'): boolean {
  const now = Date.now();
  calls[kind] = calls[kind].filter((t) => now - t < 60_000);
  if (calls[kind].length >= LIMIT[kind]) return false;
  calls[kind].push(now);
  return true;
}

export class OffError extends Error {}

async function getJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new OffError(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Barcode lookup. Returns null if the product isn't in the database. */
export async function lookupBarcode(code: string): Promise<OffConversion | null> {
  if (!navigator.onLine) throw new OffError('offline');
  if (!allow('product')) throw new OffError('Too many lookups — wait a minute (Open Food Facts limit).');
  const d = (await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}&${ident}`)) as { status?: number; product?: OffProduct };
  if (!d || d.status !== 1 || !d.product) return null;
  return offToFood(d.product, code);
}

/**
 * Text search, preferring products sold in Egypt. Open Food Facts has been moving its
 * search service, so we try the endpoints in order and use the first that answers:
 *  1. search.openfoodfacts.org (new "Search-a-licious") with a countries filter
 *  2. the classic /cgi/search.pl with the Egypt country tag
 *  3. /api/v2/search by brand (works for brand names like "Juhayna")
 */
export async function searchOff(query: string): Promise<OffConversion[]> {
  if (!navigator.onLine) throw new OffError('offline');
  if (!allow('search')) throw new OffError('Too many searches — wait a minute (Open Food Facts limit).');
  const q = query.trim();
  const attempts: (() => Promise<OffProduct[]>)[] = [
    async () => {
      const d = (await getJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(`${q} countries_tags:"en:egypt"`)}&langs=en,ar&page_size=25&fields=${FIELDS}`)) as { hits?: OffProduct[] };
      return d.hits ?? [];
    },
    async () => {
      const d = (await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&tagtype_0=countries&tag_contains_0=contains&tag_0=egypt&fields=${FIELDS}&${ident}`)) as { products?: OffProduct[] };
      return d.products ?? [];
    },
    async () => {
      const brand = q.toLowerCase().replace(/\s+/g, '-');
      const d = (await getJson(`https://world.openfoodfacts.org/api/v2/search?brands_tags=${encodeURIComponent(brand)}&countries_tags_en=egypt&page_size=25&fields=${FIELDS}&${ident}`)) as { products?: OffProduct[] };
      return d.products ?? [];
    },
  ];
  let lastErr: unknown = null;
  for (const attempt of attempts) {
    try {
      const products = await attempt();
      // Egyptian products first, skip entries without a barcode or name.
      return products
        .filter((p) => p.code)
        .sort((a, b) => Number(isEgyptian(b)) - Number(isEgyptian(a)))
        .map((p) => offToFood(p))
        .filter((c) => c.food.nameEn || c.food.nameAr);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new OffError(`Online search unavailable right now (${lastErr instanceof Error ? lastErr.message : 'network error'}). Barcode scanning still works.`);
}
