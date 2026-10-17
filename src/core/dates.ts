// Dates are stored as local "YYYY-MM-DD" strings. This avoids time-zone bugs:
// a log made at 23:30 in Cairo stays on that day no matter what UTC says.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

/** Parse "YYYY-MM-DD" as local midnight. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). Uses rounding so daylight-saving shifts don't matter. */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/**
 * Calendar week number (1-based) of `date` counted in 7-day blocks from the start date.
 * Used for weekly averages (weight, steps, calories). Can be < 1 before the start.
 */
export function calendarWeek(startDate: string, date: string): number {
  return Math.floor(diffDays(startDate, date) / 7) + 1;
}

/** First and last date of calendar week n. */
export function calendarWeekRange(startDate: string, n: number): [string, string] {
  const first = addDays(startDate, (n - 1) * 7);
  return [first, addDays(first, 6)];
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
