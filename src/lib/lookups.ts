import { db } from "./cache";
import { isoDay } from "./dates";
import type { TermDefaults } from "@/components/TermFields";

export async function getMethods(userId: string) {
  return db(userId).paymentMethod.findMany({
    where: { userId, isActive: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
}

export async function getCategoryLists(userId: string) {
  const rows = await db(userId).item.findMany({
    where: { userId },
    distinct: ["categoryGroup", "category"],
    select: { categoryGroup: true, category: true },
  });
  return {
    groups: [...new Set(rows.map((r) => r.categoryGroup))].sort(),
    categories: [...new Set(rows.map((r) => r.category))].sort(),
  };
}

/**
 * Other bills that can share a combined payment: same group and vendor.
 * Riders aren't listed: they're paid together with their main bill.
 */
export async function getCombineCandidates(userId: string, itemId: string) {
  const item = await db(userId).item.findFirst({ where: { id: itemId, userId }, select: { categoryGroup: true, vendor: true } });
  if (!item) return [];
  return db(userId).item.findMany({
    where: { userId, categoryGroup: item.categoryGroup, vendor: item.vendor, id: { not: itemId }, parentId: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Mortgage bills: the latest earlier payment with a balance recorded, which the next
 * payment's interest is worked out from. `before` = the date of the payment being edited.
 */
export async function getMortgagePrev(userId: string, itemId: string, before: Date | null) {
  const p = await db(userId).payment.findFirst({
    where: { term: { itemId, item: { userId } }, balanceHkd: { not: null }, ...(before ? { paidAt: { lt: before } } : {}) },
    orderBy: { paidAt: "desc" },
    select: { balanceHkd: true, ratePct: true },
  });
  return p ? { balance: Number(p.balanceHkd), rate: p.ratePct ? p.ratePct.toString() : "" } : null;
}

/**
 * Rider rows for the payment form. Editing (paidAt given): each rider's payment
 * on that date. Logging new: prefilled with what's left to pay on the rider's
 * term for the same policy year (or its latest term).
 */
export async function getRiderRows(userId: string, itemId: string, termStart: Date, paidAt: Date | null) {
  const riders = await db(userId).item.findMany({
    where: { userId, parentId: itemId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      terms: {
        orderBy: { startDate: "desc" },
        select: { startDate: true, amount: true, currency: true, amountHkd: true, payments: { select: { id: true, paidAt: true, amountHkd: true } } },
      },
    },
  });
  return riders.map((r) => {
    if (paidAt) {
      const p = r.terms.flatMap((t) => t.payments).find((x) => x.paidAt.getTime() === paidAt.getTime());
      return { itemId: r.id, name: r.name, paymentId: p?.id ?? "", amount: p ? p.amountHkd.toString() : "" };
    }
    const t = r.terms.find((x) => x.startDate.getTime() === termStart.getTime()) ?? r.terms[0];
    const full = t ? (t.amountHkd ? Number(t.amountHkd) : t.currency === "HKD" ? Number(t.amount) : null) : null;
    const left = t && full !== null ? Math.max(0, Math.round((full - t.payments.reduce((s, x) => s + Number(x.amountHkd), 0)) * 100) / 100) : null;
    return { itemId: r.id, name: r.name, paymentId: "", amount: left ? String(left) : "" };
  });
}

/**
 * Rider rows for the term form. Editing (startDate given): each rider's term
 * starting the same day. New term: prefilled from each rider's latest term.
 */
export async function getRiderTermRows(userId: string, itemId: string, startDate: Date | null) {
  const riders = await db(userId).item.findMany({
    where: { userId, parentId: itemId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      terms: { orderBy: { startDate: "desc" }, select: { id: true, startDate: true, amount: true, currency: true, amountHkd: true } },
    },
  });
  return riders.map((r) => {
    const t = startDate ? r.terms.find((x) => x.startDate.getTime() === startDate.getTime()) : r.terms[0];
    return {
      itemId: r.id,
      name: r.name,
      termId: startDate && t ? t.id : "",
      amount: t ? t.amount.toString() : "",
      currency: t?.currency ?? "HKD",
      amountHkd: t?.amountHkd?.toString() ?? "",
    };
  });
}

type TermRow = {
  startDate: Date;
  endDate: Date | null;
  dueDate: Date | null;
  dueRule: string;
  dueDay: number | null;
  dueMonth: number | null;
  amount: { toString(): string };
  currency: string;
  amountHkd: { toString(): string } | null;
  cycleUnit: string;
  cycleCount: number;
  notes: string | null;
};

export function termToDefaults(t: TermRow): TermDefaults {
  return {
    startDate: isoDay(t.startDate),
    endDate: isoDay(t.endDate),
    dueDate: isoDay(t.dueDate),
    dueRule: t.dueRule,
    dueDay: t.dueDay ? String(t.dueDay) : "",
    dueMonth: t.dueMonth ? String(t.dueMonth) : "",
    amount: t.amount.toString(),
    currency: t.currency,
    amountHkd: t.amountHkd?.toString() ?? "",
    cycleUnit: t.cycleUnit,
    cycleCount: String(t.cycleCount),
    notes: t.notes ?? "",
  };
}
