import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { isoDay } from "@/lib/dates";
import { getMethods } from "@/lib/lookups";
import UtilityBillForm from "@/components/UtilityBillForm";
import { BackBar } from "@/components/ui";

export default async function EditUtilityBillPage({ params }: { params: Promise<{ billId: string }> }) {
  const userId = await requireUserId();
  const { billId } = await params;
  const bill = await prisma.utilityBill.findFirst({
    where: { id: billId, utility: { userId } },
    include: { utility: { select: { id: true, name: true } } },
  });
  if (!bill) notFound();
  const methods = await getMethods(userId);

  return (
    <>
      <BackBar href={`/utilities?u=${bill.utility.id}`} label="Back to utilities" />
      <h1 className="mb-4 px-1 text-[26px] font-extrabold tracking-tight">Edit {bill.utility.name} bill</h1>
      <UtilityBillForm
        utilityId={bill.utility.id}
        billId={bill.id}
        d={{
          billMonth: bill.periodStart.toISOString().slice(0, 7),
          amount: bill.amount.toString(),
          credit: bill.credit ? bill.credit.abs().toString() : "",
          dueDate: isoDay(bill.dueDate),
          paidAt: isoDay(bill.paidAt),
          paymentMethodId: bill.paymentMethodId ?? "",
          note: bill.note ?? "",
        }}
        methods={methods}
      />
    </>
  );
}
