/**
 * Calendar helpers, in LOCAL time.
 *
 * These used to live in store.tsx. They moved here so day-book.ts and the scope
 * provider can use them without importing the provider — which would import them
 * straight back.
 *
 * toISOString() returns the UTC date, so for a shop at UTC+5 every sale made
 * before 5am local — and "today" itself whenever the local clock is ahead of
 * midnight UTC — landed on the wrong calendar day. "Today's sales" has to mean
 * today in the shop's own timezone.
 */

export function localDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return localDay(new Date());
}

/** Today's date shifted back by `n` days, in local time. */
export function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

/** `day` shifted by `n` days (negative goes back), staying in local time. */
export function shiftDay(day: string, n: number) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Parses YYYY-MM-DD as a LOCAL midnight, not the UTC midnight `new Date(str)` gives. */
export function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * YYYY-MM-DD for any stored date. Plain dates pass through; full timestamps are
 * converted to the LOCAL calendar day so they line up with todayISO() and with
 * the dates <input type="date"> produces.
 */
export function dayOf(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date.slice(0, 10) : localDay(d);
}

/** Inclusive count of days in a range. */
export function daysBetween(from: string, to: string) {
  const ms = parseDay(to).getTime() - parseDay(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** How many days a single report may span before it is truncated. */
const MAX_DAYS = 400;

/**
 * Every day from `from` to `to` inclusive, oldest first.
 *
 * Built backwards from `to` and then reversed, so an over-wide range (a mistyped
 * year, or the "All time" preset's deliberately early start) is truncated at the
 * OLD end and still shows the most recent days. Counting forwards instead would
 * cap the list at year 2000 and leave the report showing nothing recent.
 */
export function daysInRange(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  for (let d = to; d >= from && out.length < MAX_DAYS; d = shiftDay(d, -1)) out.push(d);
  return out.reverse();
}

/**
 * Narrows a range to the days that actually contain data.
 *
 * "All time" starts in the year 2000 so every consumer can share one code path,
 * but charting 9,000 empty days is useless. Pulling the start forward to the
 * first real record keeps the axis readable without the caller special-casing
 * the preset.
 */
export function clampRangeToData(range: { from: string; to: string }, days: string[]) {
  if (days.length === 0) return range;
  const earliest = days.reduce((a, d) => (d < a ? d : a), days[0]);
  return { from: earliest > range.from ? earliest : range.from, to: range.to };
}

/** "12 Aug" — compact axis and column labels. */
export function shortDay(day: string) {
  return parseDay(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** First day of the month `day` falls in. */
export function startOfMonth(day = todayISO()) {
  return `${day.slice(0, 7)}-01`;
}
