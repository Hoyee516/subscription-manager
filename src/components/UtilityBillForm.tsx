"use client";
import { deleteUtilityBill, saveUtilityBill } from "@/app/actions/utilities";
import { useAction } from "./useAction";
import { Card, Field, btnPrimary, inputCls } from "./ui";

export type BillDefaults = {
  billMonth: string; // "2026-10"
  amount: string;
  credit: string;
  dueDate: string;
  paidAt: string;
  paymentMethodId: string;
  note: string;
};

export default function UtilityBillForm({
  utilityId,
  billId,
  d,
  methods,
}: {
  utilityId: string;
  billId: string | null;
  d: BillDefaults;
  methods: { id: string; label: string }[];
}) {
  const { pending, run } = useAction();
  const back = `/utilities?u=${utilityId}`;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveUtilityBill(utilityId, billId, fd), { success: "Bill saved", goTo: () => back });
      }}
    >
      <Card className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Bill month" htmlFor="billMonth">
            <input id="billMonth" name="billMonth" type="month" required defaultValue={d.billMonth} className={inputCls} />
          </Field>
          <Field label="Amount due (HK$)" htmlFor="amount">
            <input id="amount" name="amount" inputMode="decimal" required defaultValue={d.amount} className={inputCls} />
          </Field>
        </div>
        <Field label="Subsidy / credit (HK$)" htmlFor="credit" hint="Optional. e.g. 256.31 — stored as a credit.">
          <input id="credit" name="credit" inputMode="decimal" defaultValue={d.credit} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Due date" htmlFor="dueDate">
            <input id="dueDate" name="dueDate" type="date" defaultValue={d.dueDate} className={inputCls} />
          </Field>
          <Field label="Paid on" htmlFor="paidAt">
            <input id="paidAt" name="paidAt" type="date" defaultValue={d.paidAt} className={inputCls} />
          </Field>
        </div>
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
        <Field label="Note" htmlFor="note">
          <input id="note" name="note" defaultValue={d.note} className={inputCls} />
        </Field>
      </Card>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save bill"}
      </button>
      {billId && (
        <button
          type="button"
          disabled={pending}
          className="py-2 text-[13px] font-bold text-hike-ink"
          onClick={() => {
            if (confirm("Delete this bill?")) run(() => deleteUtilityBill(billId), { success: "Bill deleted", goTo: () => back });
          }}
        >
          Delete bill
        </button>
      )}
    </form>
  );
}
