import { addDays, addMonths } from "./dates";

export type ItemTypeName = "RECURRING" | "CONTRACT" | "POLICY" | "PASS" | "TRIAL" | "PREPAID";
export type CycleUnitName = "DAY" | "WEEK" | "MONTH" | "YEAR" | "ONCE";
export type LeadUnitName = "HOUR" | "DAY" | "WEEK" | "MONTH";

export const ITEM_TYPES: { value: ItemTypeName; label: string; hint: string }[] = [
  { value: "RECURRING", label: "Recurring", hint: "Charges every cycle until you cancel (Patreon, Norton)." },
  { value: "CONTRACT", label: "Contract", hint: "Fixed commitment with an end date (HKBN, Navigator)." },
  { value: "POLICY", label: "Policy", hint: "Insurance policy year, paid before each year starts." },
  { value: "PASS", label: "One-off", hint: "A single period you buy when needed (CapCut, Uppbeat)." },
  { value: "TRIAL", label: "Trial", hint: "Free until it converts." },
  { value: "PREPAID", label: "Prepaid", hint: "Several months or years paid up front (SurfShark)." },
];

export const TYPE_LABEL: Record<ItemTypeName, string> = Object.fromEntries(
  ITEM_TYPES.map((t) => [t.value, t.label])
) as Record<ItemTypeName, string>;

export const CYCLE_UNITS: { value: CycleUnitName; label: string }[] = [
  { value: "MONTH", label: "Month" },
  { value: "YEAR", label: "Year" },
  { value: "WEEK", label: "Week" },
  { value: "DAY", label: "Day" },
  { value: "ONCE", label: "Whole term" },
];

export const CHANNELS = [
  { value: "CARD_ONLINE", label: "Card online" },
  { value: "IN_PERSON", label: "In person" },
  { value: "FPS", label: "FPS" },
  { value: "AUTOPAY", label: "Autopay" },
  { value: "OTHER", label: "Other" },
] as const;

export const CURRENCIES = ["HKD", "USD"] as const;

/** "/ year", "/ 3 months", "/ term" */
export function cycleLabel(unit: CycleUnitName, count: number): string {
  if (unit === "ONCE") return "/ term";
  const word = unit.toLowerCase();
  return count === 1 ? `/ ${word}` : `/ ${count} ${word}s`;
}

/** HK$10,181.17 · US$25 · HK$0 */
export function money(amount: number, currency = "HKD"): string {
  const prefix = currency === "HKD" ? "HK$" : currency === "USD" ? "US$" : `${currency} `;
  const whole = Number.isInteger(amount);
  return (
    prefix +
    amount.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
  );
}

export function stepCycle(d: Date, unit: CycleUnitName, count: number): Date {
  switch (unit) {
    case "DAY":
      return addDays(d, count);
    case "WEEK":
      return addDays(d, 7 * count);
    case "MONTH":
      return addMonths(d, count);
    case "YEAR":
      return addMonths(d, 12 * count);
    default:
      return d;
  }
}

type TermDates = {
  startDate: Date;
  endDate: Date | null;
  dueDate: Date | null;
  cycleUnit: CycleUnitName;
  cycleCount: number;
};

export type NextDate = { date: Date; label: string; past: boolean } | null;

/** The next date that matters for an item, given its terms sorted by startDate ascending. */
export function nextDate(type: ItemTypeName, active: boolean, terms: TermDates[], today: Date): NextDate {
  const t = terms[terms.length - 1];
  if (!t || !active) return null;
  const mk = (date: Date, label: string, pastLabel = label): NextDate => {
    const past = date < today;
    return { date, label: past ? pastLabel : label, past };
  };
  switch (type) {
    case "RECURRING": {
      if (t.cycleUnit === "ONCE" || t.cycleCount < 1) return null;
      let d = t.startDate;
      let guard = 0;
      while (d < today && guard++ < 5000) d = stepCycle(d, t.cycleUnit, t.cycleCount);
      return mk(d, "Renews");
    }
    case "POLICY":
      if (t.startDate > today) return mk(t.dueDate ?? t.startDate, "Due");
      return t.endDate ? mk(addDays(t.endDate, 1), "Renews", "Renewal overdue") : null;
    case "CONTRACT":
      return t.endDate ? mk(t.endDate, "Contract ends", "Contract ended") : null;
    default:
      return t.endDate ? mk(t.endDate, "Ends", "Ended") : null;
  }
}

export type Urgency = "green" | "orange" | "red" | null;

/** Red: under 1 month away or overdue · Orange: 1–3 months · Green: more than 3 months. */
export function urgency(date: Date | null | undefined, today: Date): Urgency {
  if (!date) return null;
  if (date < addMonths(today, 1)) return "red";
  if (date <= addMonths(today, 3)) return "orange";
  return "green";
}

export const URGENCY_BORDER: Record<Exclude<Urgency, null>, string> = {
  green: "border-[#3B9B6D]",
  orange: "border-[#E08A3C]",
  red: "border-[#D64545]",
};
