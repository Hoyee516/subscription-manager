import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { fmtDay, isoDay, todayHK } from "@/lib/dates";
import { getMethods } from "@/lib/lookups";
import { money } from "@/lib/billing";
import PaymentForm from "@/components/PaymentForm";
import { BackBar } from "@/components/ui";

export default async function LogPaymentPage({ params }: { params: Promise<{ id: string; termId: string }> }) {
  const userId = await requireUserId();
  const { id, termId } = await params;
  const term = await prisma.term.findFirst({
    where: { id: termId, itemId: id, item: { userId } },
    include: { item: { select: { name: true } }, payments: { select: { amountHkd: true } } },
  });
  if (!term) notFound();
  const methods = await getMethods(userId);

  // Prefill with what's left to pay on this term, in HKD where known.
  const fullHkd = term.amountHkd ? Number(term.amountHkd) : term.currency === "HKD" ? Number(term.amount) : null;
  const paid = term.payments.reduce((s, p) => s + Number(p.amountHkd), 0);
  const left = fullHkd !== null ? Math.max(0, Math.round((fullHkd - paid) * 100) / 100) : null;

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="px-1 text-[26px] font-extrabold tracking-tight">Log payment</h1>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {term.item.name} · term from {fmtDay(term.startDate)} · {money(Number(term.amount), term.currency)}
        {paid > 0 && ` · ${money(Math.round(paid * 100) / 100)} paid so far`}
      </p>
      <PaymentForm
        itemId={id}
        termId={termId}
        paymentId={null}
        d={{
          paidAt: isoDay(todayHK()),
          amountHkd: left ? String(left) : "",
          paymentMethodId: term.paymentMethodId ?? "",
          channel: "",
          batchRef: "",
          note: "",
        }}
        methods={methods}
      />
    </>
  );
}
