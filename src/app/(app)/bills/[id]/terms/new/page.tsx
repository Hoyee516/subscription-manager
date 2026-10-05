import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { addDays, addMonths, daysBetween, isoDay, todayHK } from "@/lib/dates";
import { getRiderTermRows, termToDefaults } from "@/lib/lookups";
import { nextInstalment, stepCycle, type CycleUnitName } from "@/lib/billing";
import { nextCycleCharge } from "@/lib/due";
import TermForm from "@/components/TermForm";
import { emptyTerm } from "@/components/TermFields";
import { BackBar } from "@/components/ui";

// New term, prefilled from the latest one: same price, cycle, payment due rule and notes.
// It starts the day after the last one ends (or one cycle later for open-ended terms) and
// runs for the same length. Recurring bills: starts at the next charge (a price change mid-way).
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
      // A price change: the new term starts at the next charge not yet paid and keeps the
      // same end date; saving ends the previous term the day before. Auto-pay bills have
      // paid everything up to today, so it's the next charge after today.
      const start = item.autoCharge
        ? nextCycleCharge(last, addDays(todayHK(), 1)) ?? last.startDate
        : nextInstalment(last, last.payments[0]?.paidAt ?? null);
      d = { ...base, startDate: isoDay(start), endDate: base.endDate, dueDate: last.dueRule === "FIXED_DATE" ? isoDay(start) : "" };
    } else {
      const start = last.endDate ? addDays(last.endDate, 1) : stepCycle(last.startDate, unit, last.cycleCount);
      // Same length: whole months where the last term was whole months (a 24-month contract
      // stays 24 months across leap years), otherwise the same number of days.
      let endDate = "";
      if (last.endDate) {
        const months =
          (last.endDate.getUTCFullYear() - last.startDate.getUTCFullYear()) * 12 + last.endDate.getUTCMonth() - last.startDate.getUTCMonth() + 1;
        endDate =
          months > 0 && addMonths(last.startDate, months).getTime() === addDays(last.endDate, 1).getTime()
            ? isoDay(addDays(addMonths(start, months), -1))
            : isoDay(addDays(start, daysBetween(last.startDate, last.endDate)));
      }
      // A specific due date keeps its distance from the term start.
      const dueDate = last.dueRule === "FIXED_DATE" && last.dueDate ? isoDay(addDays(start, daysBetween(last.startDate, last.dueDate))) : "";
      d = { ...base, startDate: isoDay(start), endDate, dueDate };
    }
  }

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">New term</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {item.name}
        {riders.length > 0 && ` + rider ${riders.map((r) => r.name).join(", ")}`} · prefilled from the last term — change anything that differs
      </p>
      <TermForm itemId={id} termId={null} itemType={item.type} d={d} riders={riders} instalments={instalments} />
    </>
  );
}
