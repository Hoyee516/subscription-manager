// Statistics page data: what was actually paid (history), biggest bills and per-card load
// (now), price analysis (insurance premium growth, subscriptions, telecom contracts, tax) and the
// mortgage principal/interest split.
import { prisma } from "./prisma";
import { addDays, addMonths, daysBetween } from "./dates";
import { money } from "./billing";
import { termChargeDate } from "./due";
import {
  categoryOf,
  cycleMonths,
  isLapsed,
  itemMonthly,
  loadData,
  methodOf,
  occurrences,
  termHkd,
  utilityMonthly,
  type Category,
} from "./schedule";

export type Paid = { date: Date; amount: number; category: Category };

/** Every payment actually made: logged payments, paid utility bills, and auto-charged bills' scheduled charges. */
async function paidHistory(userId: string, today: Date, data: Awaited<ReturnType<typeof loadData>>): Promise<Paid[]> {
  const [payments, bills] = await Promise.all([
    prisma.payment.findMany({
      where: { term: { item: { userId } } },
      select: { paidAt: true, amountHkd: true, term: { select: { item: { select: { isSavings: true, categoryGroup: true } } } } },
    }),
    prisma.utilityBill.findMany({ where: { utility: { userId } }, select: { paidAt: true, dueDate: true, periodStart: true, amount: true } }),
  ]);
  const out: Paid[] = payments.map((p) => ({ date: p.paidAt, amount: Number(p.amountHkd), category: categoryOf(p.term.item) }));
  for (const b of bills) out.push({ date: b.paidAt ?? b.dueDate ?? b.periodStart, amount: Number(b.amount), category: "utility" });
  // Auto-charged bills aren't logged: count their scheduled charges that weren't matched to a payment.
  const first = out.reduce((m, p) => (p.date < m ? p.date : m), addMonths(today, -60));
  for (const o of occurrences(data, first, today, today)) {
    if (o.kind === "charge" && o.autoCharge && !o.logged && !o.estimate && o.amount) out.push({ date: o.date, amount: o.amount, category: o.category });
  }
  return out.filter((p) => p.date <= today);
}

export async function loadStats(userId: string, today: Date) {
  const data = await loadData(userId);
  const paid = await paidHistory(userId, today, data);

  // 1 · Spending by year
  const thisYear = today.getUTCFullYear();
  const firstYear = Math.max(thisYear - 5, Math.min(...paid.map((p) => p.date.getUTCFullYear()), thisYear));
  const byYear = Array.from({ length: thisYear - firstYear + 1 }, (_, k) => {
    const y = firstYear + k;
    const parts: Partial<Record<Category, number>> = {};
    for (const p of paid) if (p.date.getUTCFullYear() === y) parts[p.category] = (parts[p.category] ?? 0) + p.amount;
    return { label: String(y), parts };
  });

  // 2 · Last 12 months (this month included)
  const thisMonth = new Date(Date.UTC(thisYear, today.getUTCMonth(), 1));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const byMonth = Array.from({ length: 12 }, (_, k) => {
    const m = addMonths(thisMonth, k - 11);
    const parts: Partial<Record<Category, number>> = {};
    for (const p of paid)
      if (p.date.getUTCFullYear() === m.getUTCFullYear() && p.date.getUTCMonth() === m.getUTCMonth())
        parts[p.category] = (parts[p.category] ?? 0) + p.amount;
    return { label: MON[m.getUTCMonth()], sub: String(m.getUTCFullYear()), parts };
  });

  // 4 · Biggest bills by yearly cost now
  const live = data.items.filter((i) => !isLapsed(i, today));
  const biggest = [
    ...live.map((i) => ({ id: i.id, name: i.name, year: itemMonthly(i, today) * 12, category: categoryOf(i) })),
    ...data.utilities.map((u) => ({ id: u.id, name: u.name, year: utilityMonthly(u, today) * 12, category: "utility" as Category })),
  ]
    .filter((x) => x.year > 0)
    .sort((a, b) => b.year - a.year)
    .slice(0, 8);

  // 6 · Per payment method (same basis as the Cards page)
  const methods = await prisma.paymentMethod.findMany({ where: { userId, isActive: true }, select: { id: true, label: true } });
  const yearAgo = addMonths(today, -12);
  const byMethod = methods
    .map((m) => {
      const items = live.filter((i) => methodOf(i)?.id === m.id).reduce((s, i) => s + itemMonthly(i, today) * 12, 0);
      const utils = data.utilities.flatMap((u) => u.bills).filter((b) => b.paidAt && b.paidAt >= yearAgo && b.paymentMethodId === m.id);
      return { id: m.id, name: m.label, year: items + utils.reduce((s, b) => s + Number(b.amount), 0) };
    })
    .filter((x) => x.year > 0)
    .sort((a, b) => b.year - a.year);

  // 5 · Insurance premium growth: each policy indexed to its first premium (in its own currency, so FX doesn't distort it)
  const growth = data.items
    .filter((i) => i.categoryGroup === "Insurance" && !i.isSavings && i.type === "POLICY" && i.terms.length >= 3 && !isLapsed(i, today))
    .map((i) => {
      const pts = i.terms
        .filter((t) => t.startDate <= today && Number(t.amount) > 0)
        .map((t) => ({ year: t.startDate.getUTCFullYear(), amount: Number(t.amount) }));
      const base = pts[0]?.amount ?? 1;
      return { id: i.id, name: i.name, points: pts.map((p) => ({ year: p.year, index: (p.amount / base) * 100 })) };
    })
    .filter((g) => g.points.length >= 3)
    .sort((a, b) => b.points[b.points.length - 1].index - a.points[a.points.length - 1].index);

  // 8 · Software & more (same grouping as the Bills filter): today's price over a year, and the
  // change from the bill's first price (same currency and cycle). Passes count what was paid in
  // the last 12 months; prepaid plans are spread over their term; trials are left out.
  const subscriptions = data.items
    .filter((i) => !["Home", "Tax", "Insurance", "Telecom"].includes(i.categoryGroup) && i.type !== "TRIAL" && !i.parentId)
    .map((i) => {
      const terms = i.terms.filter((t) => t.startDate <= today && Number(t.amount) > 0);
      if (!terms.length) return null;
      const first = terms[0];
      const last = terms[terms.length - 1];
      const comparable = terms.length > 1 && first.currency === last.currency && first.cycleUnit === last.cycleUnit && first.cycleCount === last.cycleCount;
      const pct = comparable ? (Number(last.amount) / Number(first.amount) - 1) * 100 : null;
      const price = money(Number(last.amount), last.currency);
      let perYear: number;
      let detail: string;
      if (i.type === "PASS") {
        const recent = terms.filter((t) => termChargeDate(t) > addDays(today, -365));
        perYear = recent.reduce((sum, t) => sum + (termHkd(t) ?? 0), 0);
        detail = `${recent.length} ${recent.length === 1 ? "subscription" : "subscriptions"} in the last 12 months · ${price} each`;
      } else {
        if (isLapsed(i, today)) return null;
        perYear = itemMonthly(i, today) * 12;
        detail =
          last.cycleUnit === "ONCE"
            ? `${price} prepaid for ${last.endDate ? Math.round(daysBetween(last.startDate, last.endDate) / 30.4375) : "?"} months`
            : `${price} a ${last.cycleCount > 1 ? `${last.cycleCount} ${last.cycleUnit.toLowerCase()}s` : last.cycleUnit.toLowerCase()}`;
      }
      if (!(perYear > 0)) return null;
      const since = String(first.startDate.getUTCFullYear());
      const change = pct === null ? `first price ${since}` : pct > 0.5 ? `+${pct.toFixed(0)}% since ${since}` : pct < -0.5 ? `−${Math.abs(pct).toFixed(0)}% since ${since}` : `no change since ${since}`;
      return { id: i.id, name: i.name, perYear, pct, detail: `${detail} · ${change}` };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.perYear - a.perYear);

  // 9 · Telecom: monthly price (HKD) of each contract over time; each term is a step.
  const telecom = data.items
    .filter((i) => i.categoryGroup === "Telecom" && !i.parentId && i.terms.length)
    .map((i) => ({
      id: i.id,
      name: i.name,
      steps: i.terms
        .map((t) => ({ start: t.startDate, end: t.endDate, monthly: (termHkd(t) ?? 0) / cycleMonths(t) }))
        .filter((t) => t.monthly > 0),
    }))
    .filter((t) => t.steps.length);

  // 10 · Tax: total bill per year of assessment (term start = 1 Apr), all instalments together.
  const taxYears = new Map<number, { total: number; paid: number }>();
  for (const i of data.items.filter((x) => x.categoryGroup === "Tax"))
    for (const t of i.terms) {
      const y = t.startDate.getUTCFullYear() - (t.startDate.getUTCMonth() < 3 ? 1 : 0);
      const cur = taxYears.get(y) ?? { total: 0, paid: 0 };
      taxYears.set(y, { total: cur.total + (termHkd(t) ?? 0), paid: cur.paid + t.payments.reduce((sum, p) => sum + Number(p.amountHkd), 0) });
    }
  const tax = [...taxYears.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, v]) => v.total > 0)
    .map(([y, v]) => ({ label: `${y}/${String((y + 1) % 100).padStart(2, "0")}`, total: v.total, paid: v.paid >= v.total - 1 }));

  // 7 · Mortgage: principal / interest from the payment notes ("Principal 19,851.48 · Interest 12,793.02 · … · Balance after 6,120,802.17")
  const mortgage = await prisma.item.findFirst({
    where: { userId, name: { contains: "mortgage", mode: "insensitive" } },
    select: { name: true, terms: { select: { payments: { select: { paidAt: true, note: true }, orderBy: { paidAt: "asc" } } } } },
  });
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const split = new Map<number, { principal: number; interest: number }>();
  let balance: { amount: number; date: Date } | null = null;
  for (const p of mortgage?.terms.flatMap((t) => t.payments) ?? []) {
    const m = p.note?.match(/Principal ([\d,.]+) · Interest ([\d,.]+)/);
    if (!m) continue;
    const y = p.paidAt.getUTCFullYear();
    const cur = split.get(y) ?? { principal: 0, interest: 0 };
    split.set(y, { principal: cur.principal + num(m[1]), interest: cur.interest + num(m[2]) });
    const b = p.note?.match(/Balance after ([\d,.]+)/);
    if (b && (!balance || p.paidAt > balance.date)) balance = { amount: num(b[1]), date: p.paidAt };
  }
  const mortgageYears = [...split.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, v]) => ({ label: String(y), parts: { principal: v.principal, interest: v.interest } }));

  return { byYear, byMonth, biggest, byMethod, growth, subscriptions, telecom, tax, mortgage: mortgage ? { name: mortgage.name, years: mortgageYears, balance } : null };
}

