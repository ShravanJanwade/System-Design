/** Day-granularity dates as local "YYYY-MM-DD" strings, which compare correctly as strings. */
export type DayString = string;

export function toDay(date: Date = new Date()): DayString {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day: DayString, days: number): DayString {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDay(date);
}

export function daysBetween(from: DayString, to: DayString): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}
