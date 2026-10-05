import { notFound } from "next/navigation";
import { db } from "@/lib/cache";
import { requireUserId } from "@/lib/session";
import MethodForm from "@/components/MethodForm";
import { BackBar } from "@/components/ui";

export default async function EditMethodPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const m = await db(userId).paymentMethod.findFirst({ where: { id, userId } });
  if (!m) notFound();
  return (
    <>
      <BackBar href="/cards" label="Back to payment methods" />
      <h1 className="mb-4 px-1 text-[26px] font-extrabold tracking-tight">Edit payment method</h1>
      <MethodForm id={m.id} d={{ label: m.label, type: m.type, issuer: m.issuer ?? "", isActive: m.isActive, expiryMonth: m.expiryMonth, expiryYear: m.expiryYear }} />
    </>
  );
}
