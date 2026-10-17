// Small reusable UI pieces.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fmt, parseNum } from '../core/format';
import { kcalStatus, macroStatus, proteinStatus, type Status } from '../core/nutrition';
import type { Macros } from '../core/types';
import { useApp } from '../lib/state';
import { TOTAL_WEEKS } from '../program';

/** "Week X of 20 — phase name — cut/maintenance" on every screen. */
export function Header() {
  const { week, weekInfo, next } = useApp();
  return (
    <header class="header">
      <span>
        <b>Week {week} of {TOTAL_WEEKS}</b> — {weekInfo.phase}
        {next.programComplete && ' (done!)'}
      </span>
      <span class={`pill ${weekInfo.calories}`}>{weekInfo.calories}</span>
    </header>
  );
}

const TABS = [
  { path: '/today', ico: '🏋️', label: 'Today' },
  { path: '/food', ico: '🍽️', label: 'Food' },
  { path: '/calendar', ico: '📅', label: 'Calendar' },
  { path: '/progress', ico: '📈', label: 'Progress' },
  { path: '/more', ico: '☰', label: 'More' },
];

export function TabBar({ path }: { path: string }) {
  return (
    <nav class="tabbar">
      {TABS.map((t) => (
        <a key={t.path} href={`#${t.path}`} class={path.startsWith(t.path) ? 'active' : ''}>
          <span class="ico" aria-hidden="true">{t.ico}</span>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * Numeric input that shows the right phone keyboard and accepts "82,5" or Arabic digits.
 * `kind`: decimal (kg, cm, grams) or numeric (reps, steps).
 * It keeps its own text while you type and reports the parsed number (or null).
 */
export function NumInput(props: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  kind?: 'decimal' | 'numeric';
  placeholder?: string;
  id?: string;
  class?: string;
  onBlur?: () => void;
}) {
  const [text, setText] = useState(props.value == null ? '' : String(props.value));
  // When the value changes from outside (e.g. prefill), update the text.
  useEffect(() => {
    if (parseNum(text) !== (props.value ?? null)) setText(props.value == null ? '' : String(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  return (
    <input
      id={props.id}
      class={props.class}
      type="text"
      inputMode={props.kind ?? 'decimal'}
      autoComplete="off"
      placeholder={props.placeholder}
      value={text}
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        props.onChange(parseNum(t));
      }}
      onBlur={props.onBlur}
    />
  );
}

export function Field(props: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <div>
      <label>{props.label}</label>
      {props.children}
      {props.hint && <div class="small muted" style={{ marginTop: 4 }}>{props.hint}</div>}
    </div>
  );
}

export function Bar({ value, max, status }: { value: number; max: number; status: Status | 'blue' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div class="bar"><span class={status} style={{ width: `${pct}%` }} /></div>;
}

/** Daily totals vs targets: kcal, protein, carbs, fat, colour-coded. */
export function MacroBars({ total, target }: { total: Macros; target: Macros }) {
  const rows: [string, number, number, Status, string][] = [
    ['Calories', total.kcal, target.kcal, kcalStatus(total.kcal, target.kcal), 'kcal'],
    ['Protein', total.protein, target.protein, proteinStatus(total.protein, target.protein), 'g'],
    ['Carbs', total.carbs, target.carbs, macroStatus(total.carbs, target.carbs), 'g'],
    ['Fat', total.fat, target.fat, macroStatus(total.fat, target.fat), 'g'],
  ];
  return (
    <div>
      {rows.map(([name, v, t, st, unit]) => (
        <div class="macro" key={name}>
          <div class="row between">
            <span>{name}</span>
            <span class="muted">
              <b style={{ color: 'var(--text)' }}>{fmt(v, 0)}</b> / {fmt(t, 0)} {unit}
              {' · '}{v <= t ? `${fmt(t - v, 0)} left` : `${fmt(v - t, 0)} over`}
            </span>
          </div>
          <Bar value={v} max={t} status={st} />
        </div>
      ))}
    </div>
  );
}

export function Modal(props: { onClose: () => void; children: ComponentChildren; title?: string }) {
  return (
    <div class="modal-bg" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog">
        <div class="row between">
          <h2 style={{ margin: 0 }}>{props.title}</h2>
          <button class="ghost" onClick={props.onClose} aria-label="Close">✕</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/** Food name with Arabic shown safely (RTL isolated). */
export function FoodName({ en, ar, brand }: { en: string; ar?: string; brand?: string }) {
  return (
    <span class="name">
      {en}
      {brand ? <span class="muted"> · {brand}</span> : null}
      {ar ? <> · <bdi class="ar" dir="rtl">{ar}</bdi></> : null}
    </span>
  );
}

// ---------- toast ----------
let toastSetter: ((s: string | null) => void) | null = null;
export function toast(msg: string) { toastSetter?.(msg); }
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { toastSetter = setMsg; return () => { toastSetter = null; }; }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div class="toast" role="status">{msg}</div> : null;
}
