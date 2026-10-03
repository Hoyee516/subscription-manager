"use client";
import { deletePayment, savePayment } from "@/app/actions/items";
import { CHANNELS } from "@/lib/billing";
import { useAction } from "./useAction";
import { Card, Field, btnPrimary, inputCls } from "./ui";

export type PaymentDefaults = {
  paidAt: string;
  amountHkd: string;
  paymentMethodId: string;
  channel: string;
  batchRef: string;
  note: string;
};

export default function PaymentForm({
  itemId,
  termId,
  paymentId,
  d,
  methods,
}: {
  itemId: string;
  termId: string;
  paymentId: string | null;
  d: PaymentDefaults;
  methods: { id: string; label: string }[];
}) {
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => savePayment(termId, paymentId, fd), { success: "Payment saved", goTo: () => `/bills/${itemId}` });
      }}
    >
      <Card className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Paid on" htmlFor="paidAt">
            <input id="paidAt" name="paidAt" type="date" required defaultValue={d.paidAt} className={inputCls} />
          </Field>
          <Field label="Amount (HKD)" htmlFor="amountHkd">
            <input id="amountHkd" name="amountHkd" inputMode="decimal" required defaultValue={d.amountHkd} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Paid with" htmlFor="paymentMethodId">
            <select id="paymentMethodId" name="paymentMethodId" defaultValue={d.paymentMethodId} className={inputCls}>
              <option value="">Not set</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How" htmlFor="channel">
            <select id="channel" name="channel" defaultValue={d.channel} className={inputCls}>
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Combined bill" htmlFor="batchRef" hint="If one payment covered several policies, describe it here.">
          <input id="batchRef" name="batchRef" defaultValue={d.batchRef} className={inputCls} />
        </Field>
        <Field label="Note" htmlFor="note">
          <input id="note" name="note" defaultValue={d.note} className={inputCls} />
        </Field>
      </Card>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save payment"}
      </button>
      {paymentId && (
        <button
          type="button"
          disabled={pending}
          className="py-2 text-[13px] font-bold text-hike-ink"
          onClick={() => {
            if (confirm("Delete this payment?")) {
              run(() => deletePayment(paymentId), { success: "Payment deleted", goTo: () => `/bills/${itemId}` });
            }
          }}
        >
          Delete payment
        </button>
      )}
    </form>
  );
}
