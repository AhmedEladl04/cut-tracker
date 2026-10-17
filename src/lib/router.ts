// Tiny hash router: "#/food/search?meal=lunch" → { path: "/food/search", query: { meal: "lunch" } }.
// Hash URLs work on GitHub Pages without server config and survive offline reloads.
import { useEffect, useState } from 'preact/hooks';

export interface Route { path: string; query: Record<string, string> }

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/today';
  const [path, qs = ''] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => { setR(parse()); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function go(path: string, query?: Record<string, string | number | undefined>) {
  const q = query ? Object.entries(query).filter(([, v]) => v !== undefined && v !== '') : [];
  location.hash = path + (q.length ? '?' + new URLSearchParams(q.map(([k, v]) => [k, String(v)])) : '');
}

export const back = () => history.back();
