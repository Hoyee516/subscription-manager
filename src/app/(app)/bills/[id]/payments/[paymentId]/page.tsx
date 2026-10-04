import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { isoDay } from "@/lib/dates";
import { getCombineCandidates, getMethods } from "@/lib/lookups";
import PaymentForm from "@/components/PaymentForm";
import { BackBar } from "@/components/ui";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const userId = await requireUserId();
  const { id, paymentId } = await params;
  const p = await prisma.payment.findFirst({
    where: { id: paymentId, term: { itemId: id, item: { userId } } },
    include: {
      term: { select: { item: { select: { name: true } } } },
      batch: { include: { payments: { where: { id: { not: paymentId } }, select: { term: { select: { itemId: true } } } } } },
    },
  });
  if (!p) notFound();
  const [methods, candidates] = await Promise.all([getMethods(userId), getCombineCandidates(userId, id)]);

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">Edit payment</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">{p.term.item.name}</p>
      <PaymentForm
        itemId={id}
        termId={p.termId}
        paymentId={p.id}
        d={{
          paidAt: isoDay(p.paidAt),
          amountHkd: p.amountHkd.toString(),
          paymentMethodId: p.paymentMethodId ?? "",
          channel: p.channel ?? "",
          combinedWith: p.batch?.payments.map((x) => x.term.itemId) ?? [],
          combinedTotal: p.batch?.totalHkd?.toString() ?? "",
          note: p.note ?? "",
        }}
        methods={methods}
        candidates={candidates}
      />
    </>
  );
}
