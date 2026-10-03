import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { addDays, isoDay } from "@/lib/dates";
import { termToDefaults } from "@/lib/lookups";
import { stepCycle, type CycleUnitName } from "@/lib/billing";
import TermForm from "@/components/TermForm";
import { emptyTerm } from "@/components/TermFields";
import Link from "next/link";
import { BackBar } from "@/components/ui";

// New term, prefilled from the latest one: starts the day after it ends
// (or one cycle later for open-ended terms), same price and cycle.
export default async function NewTermPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: {
      terms: { orderBy: { startDate: "desc" }, take: 1 },
      riders: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!item) notFound();

  const last = item.terms[0];
  let d = emptyTerm;
  if (last) {
    const base = termToDefaults(last);
    const unit = last.cycleUnit as CycleUnitName;
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

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">New term</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {item.name} · prefilled from the last term — change the price if it went up
      </p>
      {item.riders.length > 0 && (
        <p className="mb-3 rounded-xl bg-hike-soft px-3 py-2.5 text-[13px] text-hike-ink">
          Also add the new year for{" "}
          {item.riders.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/bills/${r.id}/terms/new`} className="font-bold underline">
                {r.name}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
      <TermForm itemId={id} termId={null} d={d} />
    </>
  );
}
