import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { addDays, addMonths, isoDay } from "@/lib/dates";
import { getRiderTermRows, termToDefaults } from "@/lib/lookups";
import { nextInstalment, stepCycle, type CycleUnitName } from "@/lib/billing";
import TermForm from "@/components/TermForm";
import { emptyTerm } from "@/components/TermFields";
import { BackBar } from "@/components/ui";

// New term, prefilled from the latest one: starts the day after it ends
// (or one cycle later for open-ended terms), same price and cycle.
// Recurring bills: starts at the next instalment (a price change mid-way).
export default async function NewTermPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: {
      terms: {
        orderBy: { startDate: "desc" },
        take: 1,
        include: {
          payments: { orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true } },
          instalments: { orderBy: { dueDate: "asc" } },
        },
      },
    },
  });
  if (!item) notFound();
  const riders = await getRiderTermRows(userId, id, null);
  // Instalments: same due dates a year later, amounts left for the new bill.
  const lastInst = item.terms[0]?.instalments ?? [];
  const instalments =
    lastInst.length || item.categoryGroup === "Tax"
      ? lastInst.map((x) => ({ dueDate: isoDay(addMonths(x.dueDate, 12)), amountHkd: "" }))
      : undefined;

  const last = item.terms[0];
  let d = emptyTerm;
  if (last) {
    const base = termToDefaults(last);
    const unit = last.cycleUnit as CycleUnitName;
    if (item.type === "RECURRING") {
      // A price change: the new term starts at the next instalment and keeps the
      // same end date; saving ends the previous term the day before.
      const start = nextInstalment(last.startDate, unit, last.cycleCount, last.payments[0]?.paidAt ?? null);
      d = { ...base, startDate: isoDay(start), endDate: base.endDate, dueDate: "", notes: "" };
    } else {
      const start = last.endDate ? addDays(last.endDate, 1) : stepCycle(last.startDate, unit, last.cycleCount);
      const lengthDays = last.endDate ? Math.round((last.endDate.getTime() - last.startDate.getTime()) / 86_400_000) : null;
      d = {
        ...base,
        startDate: isoDay(start),
        endDate: lengthDays !== null ? isoDay(addDays(start, lengthDays)) : "",
        dueDate: last.dueDate ? isoDay(start) : "",
        notes: "",
      };
    }
  }

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">New term</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {item.name}
        {riders.length > 0 && ` + rider ${riders.map((r) => r.name).join(", ")}`} · prefilled from the last term — change the price if it went up
      </p>
      <TermForm itemId={id} termId={null} d={d} riders={riders} instalments={instalments} />
    </>
  );
}
