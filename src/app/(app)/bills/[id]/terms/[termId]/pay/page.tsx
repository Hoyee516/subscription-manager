import { notFound } from "next/navigation";
import { db } from "@/lib/cache";
import { requireUserId } from "@/lib/session";
import { fmtDay, isoDay, todayHK } from "@/lib/dates";
import { getCombineCandidates, getMethods, getRiderRows } from "@/lib/lookups";
import { money, nextInstalment } from "@/lib/billing";
import PaymentForm from "@/components/PaymentForm";
import { BackBar } from "@/components/ui";

export default async function LogPaymentPage({ params }: { params: Promise<{ id: string; termId: string }> }) {
  const userId = await requireUserId();
  const { id, termId } = await params;
  const term = await db(userId).term.findFirst({
    where: { id: termId, itemId: id, item: { userId } },
    include: {
      item: { select: { name: true, paymentMethodId: true, type: true } },
      payments: { select: { amountHkd: true, paidAt: true }, orderBy: { paidAt: "desc" } },
    },
  });
  if (!term) notFound();
  const [methods, candidates, riders] = await Promise.all([
    getMethods(userId),
    getCombineCandidates(userId, id),
    getRiderRows(userId, id, term.startDate, null),
  ]);

  // Prefill with what's left to pay on this term, in HKD where known.
  const fullHkd = term.amountHkd ? Number(term.amountHkd) : term.currency === "HKD" ? Number(term.amount) : null;
  const paid = term.payments.reduce((s, p) => s + Number(p.amountHkd), 0);
  const left = fullHkd !== null ? Math.max(0, Math.round((fullHkd - paid) * 100) / 100) : null;

  // Recurring: each payment is one instalment, due one cycle after the last one.
  const recurring = term.item.type === "RECURRING";
  const prefillAmount = recurring ? fullHkd : left;
  const prefillDate = recurring
    ? nextInstalment(term, term.payments[0]?.paidAt ?? null)
    : todayHK();

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">Log payment</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {term.item.name} · term from {fmtDay(term.startDate)} · {money(Number(term.amount), term.currency)}
        {paid > 0 && !recurring && ` · ${money(Math.round(paid * 100) / 100)} paid so far`}
      </p>
      <PaymentForm
        itemId={id}
        termId={termId}
        paymentId={null}
        d={{
          paidAt: isoDay(prefillDate),
          amountHkd: prefillAmount ? String(prefillAmount) : "",
          paymentMethodId: term.item.paymentMethodId ?? "",
          channel: "",
          combinedWith: [],
          combinedTotal: "",
          note: "",
        }}
        methods={methods}
        candidates={candidates}
        itemName={term.item.name}
        riders={riders}
      />
    </>
  );
}
