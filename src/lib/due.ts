// When a term's charges fall, from its "Payment due" rule. Every screen that shows a
// charge date (schedule, calendar, alerts, Google Calendar, the term form preview)
// goes through these helpers, so the rule lives in one place. Pure: safe in the browser.
import { addDays } from "./dates";

export type DueRuleName = "START_DATE" | "DAY_OF_MONTH" | "DAY_OF_YEAR" | "FIXED_DATE" | "INSTALMENTS";

export const DUE_RULE_LABEL: Record<DueRuleName, string> = {
  START_DATE: "Same as start date",
  DAY_OF_MONTH: "Fixed day each month",
  DAY_OF_YEAR: "Fixed date each year",
  FIXED_DATE: "Specific date",
  INSTALMENTS: "Instalments",
};

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Rules offered for a cycle: monthly bills get a day of the month, yearly ones a date each year. */
export function rulesFor(cycleUnit: string, allowInstalments: boolean): DueRuleName[] {
  const out: DueRuleName[] = ["START_DATE"];
  if (cycleUnit === "MONTH") out.push("DAY_OF_MONTH");
  if (cycleUnit === "YEAR") out.push("DAY_OF_YEAR");
  out.push("FIXED_DATE");
  if (allowInstalments) out.push("INSTALMENTS");
  return out;
}

export type DueTerm = {
  startDate: Date;
  endDate: Date | null;
  dueDate: Date | null;
  dueRule?: string | null;
  dueDay?: number | null;
  dueMonth?: number | null; // 1–12
  cycleUnit: string;
  cycleCount: number;
};

/** Item types charged once per cycle (the rest are charged once per term). */
export const chargesEachCycle = (itemType: string, cycleUnit: string) =>
  (itemType === "RECURRING" || itemType === "CONTRACT") && cycleUnit !== "ONCE";

/** Calendar date for year y, month m (0-based, may overflow), day d; days past the month's end fall on its last day. */
function at(y: number, m: number, d: number): Date {
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yy, mm, Math.min(Math.max(1, d), last)));
}

function rule(t: DueTerm): DueRuleName {
  const r = (t.dueRule ?? "START_DATE") as DueRuleName;
  if (r === "DAY_OF_MONTH" && !t.dueDay) return "START_DATE";
  if (r === "DAY_OF_YEAR" && (!t.dueDay || !t.dueMonth)) return "START_DATE";
  if (r === "FIXED_DATE" && !t.dueDate) return "START_DATE";
  return r;
}

/** Months between charges, for month- and year-based cycles. */
function cycleMonths(t: DueTerm): number | null {
  const c = Math.max(1, t.cycleCount);
  if (t.cycleUnit === "MONTH") return c;
  if (t.cycleUnit === "YEAR") return 12 * c;
  return null;
}

/** The candidate closest to `ref` (ties go to the earlier one). */
function nearest(ref: Date, candidates: Date[]): Date {
  return candidates.reduce((a, b) => (Math.abs(b.getTime() - ref.getTime()) < Math.abs(a.getTime() - ref.getTime()) ? b : a));
}

/**
 * Terms charged once (policies, prepaid, passes, one-offs): the charge date.
 * A day-of-month or date-each-year rule picks the matching date closest to the term start,
 * so Bupa's 23 Jul lands before its 1 Aug policy start.
 */
export function termChargeDate(t: DueTerm): Date {
  const s = t.startDate;
  const y = s.getUTCFullYear();
  const m = s.getUTCMonth();
  switch (rule(t)) {
    case "FIXED_DATE":
    case "INSTALMENTS":
      return t.dueDate ?? s;
    case "DAY_OF_MONTH":
      return nearest(s, [at(y, m - 1, t.dueDay!), at(y, m, t.dueDay!), at(y, m + 1, t.dueDay!)]);
    case "DAY_OF_YEAR":
      return nearest(s, [at(y - 1, t.dueMonth! - 1, t.dueDay!), at(y, t.dueMonth! - 1, t.dueDay!), at(y + 1, t.dueMonth! - 1, t.dueDay!)]);
    default:
      return s;
  }
}

/** Terms charged every cycle: the first charge, on or after the term start. */
function firstCycleCharge(t: DueTerm): { first: Date; day: number } {
  const s = t.startDate;
  const y = s.getUTCFullYear();
  const m = s.getUTCMonth();
  const r = rule(t);
  if (r === "FIXED_DATE") return { first: t.dueDate!, day: t.dueDate!.getUTCDate() };
  if (r === "DAY_OF_MONTH" || (r === "DAY_OF_YEAR" && t.cycleUnit !== "YEAR")) {
    const d = t.dueDay!;
    const c = at(y, m, d);
    return { first: c >= s ? c : at(y, m + 1, d), day: d };
  }
  if (r === "DAY_OF_YEAR") {
    const c = at(y, t.dueMonth! - 1, t.dueDay!);
    return { first: c >= s ? c : at(y + 1, t.dueMonth! - 1, t.dueDay!), day: t.dueDay! };
  }
  return { first: s, day: s.getUTCDate() };
}

/**
 * Terms charged every cycle: every charge date from the first one up to `stop` (inclusive).
 * Dates are worked out from the first charge, so a 31st stays the 31st after a short month.
 */
export function cycleChargeDates(t: DueTerm, stop: Date, max = 2000): Date[] {
  const { first, day } = firstCycleCharge(t);
  const months = cycleMonths(t);
  const c = Math.max(1, t.cycleCount);
  const stepDays = t.cycleUnit === "WEEK" ? 7 * c : t.cycleUnit === "DAY" ? c : null;
  const out: Date[] = [];
  for (let k = 0; k < max; k++) {
    const d = months ? at(first.getUTCFullYear(), first.getUTCMonth() + k * months, day) : stepDays ? addDays(first, stepDays * k) : first;
    if (d > stop) break;
    out.push(d);
    if (!months && !stepDays) break; // whole-term cycle: a single charge
  }
  return out;
}

/** Terms charged every cycle: the first charge on or after `from`, within the term (null if none left). */
export function nextCycleCharge(t: DueTerm, from: Date): Date | null {
  const stop = t.endDate ?? addDays(from, 800);
  return cycleChargeDates(t, stop).find((d) => d >= from) ?? null;
}

/**
 * Terms charged every cycle: the charge after the one a payment settled. The settled charge is
 * the one nearest the payment date (payments are often a few days early or late).
 */
export function chargeAfterPayment(t: DueTerm, paidAt: Date | null): Date {
  const { first } = firstCycleCharge(t);
  if (!paidAt || paidAt < addDays(first, -45)) return first;
  const list = cycleChargeDates(t, addDays(paidAt, 800));
  let k = 0;
  for (let n = 1; n < list.length; n++)
    if (Math.abs(list[n].getTime() - paidAt.getTime()) < Math.abs(list[k].getTime() - paidAt.getTime())) k = n;
  return list[k + 1] ?? list[k];
}

/** "25th of each month", "23 Jul each year", "On 1 Aug 2026", "Same as start date". */
export function dueRuleText(t: DueTerm): string {
  const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  switch (rule(t)) {
    case "DAY_OF_MONTH":
      return `${ord(t.dueDay!)} of each month`;
    case "DAY_OF_YEAR":
      return `${t.dueDay} ${MONTH_NAMES[t.dueMonth! - 1]} each year`;
    case "FIXED_DATE":
      return `On ${t.dueDate!.getUTCDate()} ${MONTH_NAMES[t.dueDate!.getUTCMonth()]} ${t.dueDate!.getUTCFullYear()}`;
    case "INSTALMENTS":
      return "Instalments";
    default:
      return "Same as start date";
  }
}
