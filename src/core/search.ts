// Food search that tolerates Arabic spelling variants and English transliterations,
// e.g. koshary / koshari / كشري, foul / ful / فول, ta'meya / taameya / طعمية.
//
// Idea: reduce every name to a "skeleton" where look-alike spellings become identical,
// then match the skeleton of the query against the skeletons of names and aliases.

const AR_DIACRITICS = /[ً-ٰٟـ]/g; // tashkeel + superscript alef + tatweel

export function normalizeArabic(s: string): string {
  return s
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '');
}

/** Latin skeleton: lower-case, drop accents/apostrophes, fold vowels and doubled letters. */
export function normalizeLatin(s: string): string {
  let t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/['`’‘ʼ-]/g, '');            // ta'meya → tameya
  t = t.replace(/q/g, 'k').replace(/ph/g, 'f');
  t = t.replace(/ou|oo|o/g, 'u');            // foul/fool/fol → ful
  t = t.replace(/ee|ei|ey|ie|e|y/g, 'i');    // koshary/koshari, taameya/taamiya
  t = t.replace(/([a-z])\1+/g, '$1');        // taameya → tamiya, hummus → humus
  t = t.replace(/([aiu])h\b/g, '$1');        // mulukhiyah → mulukhiya
  return t;
}

/** Normalise any text (mixed Arabic/Latin) into search tokens. */
export function tokens(s: string): string[] {
  return normalizeLatin(normalizeArabic(s))
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter(Boolean);
}

/** Keys stored on each food so search is fast: one entry per token of every name. */
export function searchKeysFor(food: { nameEn: string; nameAr: string; aliases: string[]; brand?: string }): string[] {
  const all = [food.nameEn, food.nameAr, food.brand ?? '', ...food.aliases].flatMap(tokens);
  return [...new Set(all)];
}

/**
 * Score how well `query` matches a food: 0 = no match. Every query token must match
 * some key (as prefix or substring). Exact > prefix > substring.
 */
export function matchScore(query: string, keys: string[]): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  let score = 0;
  for (const t of q) {
    let best = 0;
    for (const k of keys) {
      if (k === t) best = Math.max(best, 3);
      else if (k.startsWith(t)) best = Math.max(best, 2);
      else if (t.length >= 3 && k.includes(t)) best = Math.max(best, 1);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

export interface Searchable { searchKeys?: string[]; nameEn: string; nameAr: string; aliases: string[]; brand?: string; favourite?: boolean; lastUsedAt?: number }

/** Rank foods: match quality first, then favourites, then recently used. */
export function searchFoods<T extends Searchable>(foods: T[], query: string, limit = 40): T[] {
  return foods
    .map((f) => ({ f, s: matchScore(query, f.searchKeys ?? searchKeysFor(f)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(!!b.f.favourite) - Number(!!a.f.favourite) || (b.f.lastUsedAt ?? 0) - (a.f.lastUsedAt ?? 0))
    .slice(0, limit)
    .map((x) => x.f);
}
