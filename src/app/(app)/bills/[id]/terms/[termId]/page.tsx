import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { getRiderTermRows, termToDefaults } from "@/lib/lookups";
import { isoDay } from "@/lib/dates";
import TermForm from "@/components/TermForm";
import { BackBar } from "@/components/ui";

export default async function EditTermPage({ params }: { params: Promise<{ id: string; termId: string }> }) {
  const userId = await requireUserId();
  const { id, termId } = await params;
  const term = await prisma.term.findFirst({
    where: { id: termId, itemId: id, item: { userId } },
    include: {
      item: { select: { name: true, categoryGroup: true, type: true } },
      instalments: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!term) notFound();
  const riders = await getRiderTermRows(userId, id, term.startDate);
  // Instalment rows for tax bills, or any term that already has instalments.
  const instalments =
    term.instalments.length || term.item.categoryGroup === "Tax"
      ? term.instalments.map((x) => ({ dueDate: isoDay(x.dueDate), amountHkd: x.amountHkd.toString() }))
      : undefined;

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">Edit term</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {term.item.name}
        {riders.length > 0 && ` + rider ${riders.map((r) => r.name).join(", ")}`}
      </p>
      <TermForm itemId={id} termId={termId} itemType={term.item.type} d={termToDefaults(term)} riders={riders} instalments={instalments} />
    </>
  );
}
