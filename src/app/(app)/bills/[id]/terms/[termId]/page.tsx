import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { termToDefaults } from "@/lib/lookups";
import TermForm from "@/components/TermForm";
import { BackBar } from "@/components/ui";

export default async function EditTermPage({ params }: { params: Promise<{ id: string; termId: string }> }) {
  const userId = await requireUserId();
  const { id, termId } = await params;
  const term = await prisma.term.findFirst({
    where: { id: termId, itemId: id, item: { userId } },
    include: { item: { select: { name: true } } },
  });
  if (!term) notFound();

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">Edit term</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">{term.item.name}</p>
      <TermForm itemId={id} termId={termId} d={termToDefaults(term)} />
    </>
  );
}
