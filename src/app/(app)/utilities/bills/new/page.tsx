import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { getMethods } from "@/lib/lookups";
import UtilityBillForm from "@/components/UtilityBillForm";
import { BackBar } from "@/components/ui";

export default async function NewUtilityBillPage({ searchParams }: { searchParams: Promise<{ u?: string; m?: string }> }) {
  const userId = await requireUserId();
  const { u, m } = await searchParams;
  const utility = u ? await prisma.utility.findFirst({ where: { id: u, userId } }) : null;
  if (!utility) notFound();
  const methods = await getMethods(userId);

  return (
    <>
      <BackBar href={`/utilities?u=${utility.id}`} label="Back to utilities" />
      <h1 className="mb-4 px-1 text-[26px] font-extrabold tracking-tight">Add {utility.name} bill</h1>
      <UtilityBillForm
        utilityId={utility.id}
        billId={null}
        d={{
          billMonth: m && /^\d{4}-\d{2}$/.test(m) ? m : "",
          amount: "",
          credit: "",
          dueDate: "",
          paidAt: "",
          paymentMethodId: "",
          note: "",
        }}
        methods={methods}
      />
    </>
  );
}
