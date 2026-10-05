import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/cache";
import { requireUserId } from "@/lib/session";
import { isoDay } from "@/lib/dates";
import { getCombineCandidates, getMethods, getRiderRows } from "@/lib/lookups";
import PaymentForm from "@/components/PaymentForm";
import { BackBar } from "@/components/ui";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const userId = await requireUserId();
  const { id, paymentId } = await params;
  const p = await db(userId).payment.findFirst({
    where: { id: paymentId, term: { itemId: id, item: { userId } } },
    include: {
      term: { select: { startDate: true, item: { select: { name: true, parentId: true } } } },
      batch: { include: { payments: { where: { id: { not: paymentId } }, select: { term: { select: { itemId: true } } } } } },
    },
  });
  if (!p) notFound();

  // A rider's payment is edited together with its main bill's payment on the same date.
  const parentId = p.term.item.parentId;
  if (parentId) {
    const main = await db(userId).payment.findFirst({ where: { paidAt: p.paidAt, term: { itemId: parentId } }, select: { id: true } });
    if (main) redirect(`/bills/${parentId}/payments/${main.id}`);
  }

  const [methods, candidates, riders] = await Promise.all([
    getMethods(userId),
    getCombineCandidates(userId, id),
    getRiderRows(userId, id, p.term.startDate, p.paidAt),
  ]);

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">Edit payment</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {p.term.item.name}
        {riders.length > 0 && ` + rider ${riders.map((r) => r.name).join(", ")}`}
      </p>
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
        itemName={p.term.item.name}
        riders={riders}
      />
    </>
  );
}
