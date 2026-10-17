// Parsing/formatting of numbers typed on a phone keyboard.

/**
 * Parse "82.5", "82,5", "٨٢٫٥" (Arabic-Indic digits) → 82.5. Empty/invalid → null.
 * Arabic phone keyboards often produce ٫ or , as the decimal separator.
 */
export function parseNum(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.')
    .replace(/\s/g, '');
  if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 7400 → "7,400" */
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Format with up to `d` decimals, dropping trailing zeros: 82.50 → "82.5". */
export const fmt = (n: number | null | undefined, d = 1) => (n == null ? '–' : String(Number(n.toFixed(d))));

/** Seconds → "2:05" */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
