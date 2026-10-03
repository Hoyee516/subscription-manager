import { prisma } from "./prisma";
import { isoDay } from "./dates";
import type { TermDefaults } from "@/components/TermFields";

export async function getMethods(userId: string) {
  return prisma.paymentMethod.findMany({
    where: { userId, isActive: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
}

export async function getCategoryLists(userId: string) {
  const rows = await prisma.item.findMany({
    where: { userId },
    distinct: ["categoryGroup", "category"],
    select: { categoryGroup: true, category: true },
  });
  return {
    groups: [...new Set(rows.map((r) => r.categoryGroup))].sort(),
    categories: [...new Set(rows.map((r) => r.category))].sort(),
  };
}

type TermRow = {
  startDate: Date;
  endDate: Date | null;
  dueDate: Date | null;
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
    amount: t.amount.toString(),
    currency: t.currency,
    amountHkd: t.amountHkd?.toString() ?? "",
    cycleUnit: t.cycleUnit,
    cycleCount: String(t.cycleCount),
    notes: t.notes ?? "",
  };
}
