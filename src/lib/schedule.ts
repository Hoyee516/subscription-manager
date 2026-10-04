// Phase 2 engine: monthly cost (MRC) per item and the dated charges ("occurrences")
// that the Home overview, Calendar and Cards screens are built from.
import { prisma } from "./prisma";
import { addDays, addMonths, daysBetween } from "./dates";
import { stepCycle, type CycleUnitName, type ItemTypeName } from "./billing";
import { toHkd } from "./fx";

export type Category = "insurance" | "home" | "tax" | "subs" | "utility" | "savings";

// Calendar dot colours: a set checked to stay apart for normal and colour-blind vision
// (the legend and the day list name each category, so colour is never the only cue).
export const CATEGORY: Record<Category, { label: string; color: string }> = {
  insurance: { label: "Insurance", color: "#E34948" },
  home: { label: "Home", color: "#EDA100" },
  tax: { label: "Tax", color: "#7A5A00" },
  subs: { label: "Subs & telecom", color: "#1BAF7A" },
  utility: { label: "Utilities", color: "#2A78D6" },
  savings: { label: "Savings-type", color: "#4A3AA7" },
};

export type Occurrence = {
  key: string;
  date: Date;
  href: string;
  name: string;
  sub: string; // card / note line
  amount: number | null; // HKD; null = no charge (e.g. a trial ending)
  estimate: boolean;
  paid: boolean;
  logged: boolean; // matched to a logged payment (vs. counted as paid because it's auto-charged)
  autoCharge: boolean;
  kind: "charge" | "ends";
  category: Category;
};

type TermRow = {
  startDate: Date;
  endDate: Date | null;
  dueDate: Date | null;
  amount: { toString(): string };
  currency: string;
  amountHkd: { toString(): string } | null;
  cycleUnit: string;
  cycleCount: number;
};

export const termHkd = (t: TermRow) =>
  toHkd(Number(t.amount), t.currency, t.amountHkd ? Number(t.amountHkd) : null).hkd;

/** Months covered by one charge of this term. */
function cycleMonths(t: TermRow): number {
  const c = Math.max(1, t.cycleCount);
  switch (t.cycleUnit as CycleUnitName) {
    case "MONTH":
      return c;
    case "YEAR":
      return 12 * c;
    case "WEEK":
      return (7 * c) / 30.4375;
    case "DAY":
      return c / 30.4375;
    default: // ONCE: the whole term
      return t.endDate ? Math.max(1, (daysBetween(t.startDate, t.endDate) + 1) / 30.4375) : 12;
  }
}

/** The term in force today (latest one that has started), else the first upcoming one. */
function currentTerm<T extends TermRow>(terms: T[], today: Date): T | undefined {
  const started = terms.filter((t) => t.startDate <= today);
  return started[started.length - 1] ?? terms[0];
}

export function categoryOf(i: { isSavings: boolean; categoryGroup: string }): Category {
  if (i.isSavings) return "savings";
  if (i.categoryGroup === "Insurance") return "insurance";
  if (i.categoryGroup === "Home") return "home";
  if (i.categoryGroup === "Tax") return "tax";
  return "subs";
}

/** Everything active for a user; `only` narrows it to one bill or one utility. */
export async function loadData(userId: string, only?: { itemId: string } | { utilityId: string }) {
  const itemWhere = only ? ("itemId" in only ? { id: only.itemId } : { id: { in: [] as string[] } }) : {};
  const utilityWhere = only ? ("utilityId" in only ? { id: only.utilityId } : { id: { in: [] as string[] } }) : {};
  const [items, utilities] = await Promise.all([
    prisma.item.findMany({
      where: { userId, status: "ACTIVE", ...itemWhere },
      orderBy: { name: "asc" },
      include: {
        paymentMethod: { select: { id: true, label: true, isActive: true } },
        parent: { select: { paymentMethodId: true, paymentMethod: { select: { id: true, label: true, isActive: true } } } },
        terms: {
          orderBy: { startDate: "asc" },
          include: { payments: { select: { paidAt: true, amountHkd: true } }, instalments: { orderBy: { dueDate: "asc" } } },
        },
      },
    }),
    prisma.utility.findMany({
      where: { userId, isActive: true, ...utilityWhere },
      orderBy: { name: "asc" },
      include: { bills: { orderBy: { periodStart: "asc" }, include: { paymentMethod: { select: { label: true } } } } },
    }),
  ]);
  return { items, utilities };
}
type Data = Awaited<ReturnType<typeof loadData>>;
export type LoadedData = Data;
export type LoadedItem = Data["items"][number];
export type LoadedUtility = Data["utilities"][number];

/** Trials, one-offs and prepaid bills whose last term has ended count as ended (same rule as the Bills list). */
export function isLapsed(i: LoadedItem, today: Date): boolean {
  const last = i.terms[i.terms.length - 1];
  return ["TRIAL", "PASS", "PREPAID"].includes(i.type) && !!last?.endDate && last.endDate < today;
}

/** The card an item is charged to; riders follow their main bill. */
export function methodOf(i: LoadedItem) {
  return i.paymentMethod ?? i.parent?.paymentMethod ?? null;
}

/** Monthly cost in HKD. Trials and one-off passes aren't recurring commitments: 0. */
export function itemMonthly(i: LoadedItem, today: Date): number {
  if (i.type === "TRIAL" || i.type === "PASS" || isLapsed(i, today)) return 0;
  const t = currentTerm(i.terms, today);
  if (!t) return 0;
  const hkd = termHkd(t);
  return hkd ? hkd / cycleMonths(t) : 0;
}

/** Average month of a utility over the last 12 months of bills. */
export function utilityMonthly(u: Data["utilities"][number], today: Date): number {
  const from = addMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -11);
  const sum = u.bills.filter((b) => b.periodStart >= from && b.periodStart <= today).reduce((s, b) => s + Number(b.amount), 0);
  return sum / 12;
}

export function summary(data: Data, today: Date) {
  const by: Record<Category, number> = { insurance: 0, home: 0, tax: 0, subs: 0, utility: 0, savings: 0 };
  let active = 0;
  for (const i of data.items) {
    if (isLapsed(i, today)) continue;
    active++;
    by[categoryOf(i)] += itemMonthly(i, today);
  }
  for (const u of data.utilities) by.utility += utilityMonthly(u, today);
  // Savings-type premiums (儲蓄, 年金) are included; the Overview also breaks them out.
  const mrc = by.insurance + by.home + by.tax + by.subs + by.utility + by.savings;
  return { by, mrc, annual: mrc * 12, active };
}

/** Dated charges between from and to (inclusive). */
export function occurrences(data: Data, from: Date, to: Date, today: Date): Occurrence[] {
  const out: Occurrence[] = [];

  for (const i of data.items) {
    if (isLapsed(i, today) && i.terms[i.terms.length - 1]?.endDate && i.terms[i.terms.length - 1].endDate! < from) continue;
    const type = i.type as ItemTypeName;
    const cat = categoryOf(i);
    const card = methodOf(i)?.label ?? "no card set";
    const payments = i.terms.flatMap((t) => t.payments.map((p) => p.paidAt));
    const used = new Set<number>();
    // A charge counts as paid if a payment was logged shortly before or after it:
    // up to 10 days early for monthly-or-shorter cycles, 45 days early otherwise (e.g. yearly policies).
    const paidNear = (d: Date, early: number) => {
      const idx = payments.findIndex((p, k) => !used.has(k) && p >= addDays(d, -early) && p <= addDays(d, 10));
      if (idx < 0) return false;
      used.add(idx);
      return true;
    };
    const push = (date: Date, amount: number | null, estimate: boolean, kind: Occurrence["kind"], note?: string, early = 45) => {
      if (date < from || date > to) return;
      const logged = kind === "charge" && paidNear(date, early);
      out.push({
        key: `${i.id}-${date.toISOString()}-${kind}`,
        date,
        href: `/bills/${i.id}`,
        name: i.name,
        sub: note ?? card,
        amount,
        estimate,
        // Auto-charged bills: a charge that has fallen due counts as paid without a logged payment.
        paid: logged || (kind === "charge" && i.autoCharge && !estimate && date <= today),
        logged,
        autoCharge: i.autoCharge,
        kind,
        category: cat,
      });
    };

    i.terms.forEach((t, k) => {
      const next = i.terms[k + 1];
      const hkd = termHkd(t);
      const isLast = !next;
      const unit = t.cycleUnit as CycleUnitName;

      if ((type === "RECURRING" || type === "CONTRACT") && unit !== "ONCE") {
        // One charge per cycle from the term start until the next term (or the term/contract end).
        const stop = next ? addDays(next.startDate, -1) : t.endDate ?? to;
        for (let d = t.startDate, n = 0; d <= stop && d <= to && n < 2000; d = stepCycle(d, unit, t.cycleCount), n++) {
          push(d, hkd, false, "charge", undefined, unit === "YEAR" ? 45 : 10);
        }
        if (isLast && type === "CONTRACT" && t.endDate) push(t.endDate, null, false, "ends", "Contract ends");
        return;
      }

      // Paid in instalments (e.g. salaries tax): one charge per instalment, no renewal estimate.
      if (t.instalments.length) {
        t.instalments.forEach((x, n) =>
          push(x.dueDate, Number(x.amountHkd), false, "charge", `Instalment ${n + 1} of ${t.instalments.length} · ${card}`)
        );
        return;
      }

      // POLICY / PREPAID / PASS / TRIAL / one-off terms: one charge per term.
      const due = t.dueDate ?? t.startDate;
      if (hkd) push(due, hkd, false, "charge");
      if (!isLast) return;
      if (type === "TRIAL" && t.endDate) push(t.endDate, null, false, "ends", "Trial ends — cancel or it converts");
      else if (type === "PASS" && t.endDate) push(t.endDate, null, false, "ends", "Pass ends");
      else if ((type === "POLICY" || (type === "PREPAID" && i.autoRenew)) && t.endDate) {
        // Next renewal(s) not entered yet: estimate from the current price.
        const len = unit === "ONCE" ? null : unit;
        for (let d = addDays(t.endDate, 1), n = 0; d <= to && n < 50; n++) {
          push(d, hkd, true, "charge", `Estimate · renewal not entered yet · ${card}`);
          d = len ? stepCycle(d, len, t.cycleCount) : addDays(d, daysBetween(t.startDate, t.endDate) + 1);
        }
      }
    });
  }

  for (const u of data.utilities) {
    const sameMonthLastYear = (m: Date) => u.bills.find((b) => b.periodStart.getTime() === addMonths(m, -12).getTime());
    for (const b of u.bills) {
      if (!b.dueDate) continue;
      if (b.dueDate < from || b.dueDate > to) continue;
      out.push({
        key: `u-${b.id}`,
        date: b.dueDate,
        href: `/utilities/bills/${b.id}`,
        name: u.name,
        sub: b.paidAt ? `Paid${b.paymentMethod ? ` · ${b.paymentMethod.label}` : ""}` : "Not paid yet",
        amount: Number(b.amount),
        estimate: false,
        paid: !!b.paidAt,
        logged: !!b.paidAt,
        autoCharge: false,
        kind: "charge",
        category: "utility",
      });
    }
    // Bills expected but not entered: placed on the last day of the bill month, estimated from last year.
    const latest = u.bills[u.bills.length - 1];
    if (!latest) continue;
    for (let m = addMonths(latest.periodStart, u.cycleMonths), n = 0; n < 24; m = addMonths(m, u.cycleMonths), n++) {
      const date = addDays(addMonths(m, 1), -1);
      if (date > to) break;
      if (date < from) continue;
      const ref = sameMonthLastYear(m) ?? latest;
      out.push({
        key: `u-${u.id}-${m.toISOString()}`,
        date,
        href: `/utilities/bills/new?u=${u.id}&m=${m.toISOString().slice(0, 7)}`,
        name: u.name,
        sub: `Estimate · bill not entered yet`,
        amount: Number(ref.amount),
        estimate: true,
        paid: false,
        logged: false,
        autoCharge: false,
        kind: "charge",
        category: "utility",
      });
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || (b.amount ?? 0) - (a.amount ?? 0));
}

/** Price hikes: an item's latest term costs more than the one before, started in the last 120 days or about to. */
export function priceHikes(data: Data, today: Date) {
  const out: { id: string; termId: string; name: string; pct: number; from: number; to: number; currency: string; perYear: number | null }[] = [];
  for (const i of data.items) {
    if (isLapsed(i, today) || i.terms.length < 2) continue;
    const t = i.terms[i.terms.length - 1];
    const p = i.terms[i.terms.length - 2];
    if (t.startDate < addDays(today, -120) || t.startDate > addDays(today, 60)) continue;
    if (p.currency !== t.currency || p.cycleUnit !== t.cycleUnit || p.cycleCount !== t.cycleCount) continue;
    const a = Number(p.amount);
    const b = Number(t.amount);
    if (!(a > 0) || b <= a * 1.001) continue;
    const ha = termHkd(p);
    const hb = termHkd(t);
    const perYear = ha != null && hb != null ? ((hb - ha) / cycleMonths(t)) * 12 : null;
    out.push({ id: i.id, termId: t.id, name: i.name, pct: (b / a - 1) * 100, from: a, to: b, currency: t.currency, perYear });
  }
  return out.sort((x, y) => y.pct - x.pct);
}
