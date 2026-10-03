// All billing dates are stored as UTC-midnight calendar dates (@db.Date).
// These helpers keep them as calendar dates — no timezone shifting.

const HK_TZ = "Asia/Hong_Kong";

/** Today's calendar date in Hong Kong, as UTC midnight. */
export function todayHK(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: HK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
  return new Date(`${s}T00:00:00Z`);
}

/** "2026-08-01" → Date (UTC midnight). Returns null for empty input. */
export function parseDay(s: FormDataEntryValue | null | undefined): Date | null {
  const v = typeof s === "string" ? s.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00Z`);
}

/** Date → "2026-08-01" for <input type="date">. */
export function isoDay(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Date → "1 Aug 2026". */
export function fmtDay(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Date → "Aug 2026". */
export function fmtMonth(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Adds months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
