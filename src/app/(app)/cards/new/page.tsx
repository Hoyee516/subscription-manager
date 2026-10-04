import { requireUserId } from "@/lib/session";
import MethodForm from "@/components/MethodForm";
import { BackBar } from "@/components/ui";

export default async function NewMethodPage() {
  await requireUserId();
  return (
    <>
      <BackBar href="/cards" label="Back to payment methods" />
      <h1 className="mb-4 px-1 text-[26px] font-extrabold tracking-tight">New payment method</h1>
      <MethodForm id={null} d={{ label: "", type: "CARD", issuer: "", isActive: true }} />
    </>
  );
}
