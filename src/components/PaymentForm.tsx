"use client";
import { useState } from "react";
import { deletePayment, savePayment } from "@/app/actions/items";
import { CHANNELS, money } from "@/lib/billing";
import { splitInstalment } from "@/lib/mortgage";
import { useAction } from "./useAction";
import { Card, Field, btnPrimary, commaBlur, inputCls, withCommas } from "./ui";

export type PaymentDefaults = {
  paidAt: string;
  amountHkd: string;
  paymentMethodId: string;
  channel: string;
  combinedWith: string[]; // item ids of the other bills in the same combined bill
  combinedTotal: string;
  note: string;
};

/** Mortgage bills: the split of this instalment. prevBalance = balance after the previous payment, if known. */
export type MortgageDefaults = { prevBalance: number | null; rate: string; interest: string; principal: string; balance: string };

/** A rider of this bill, paid together with it: same date, card and channel. */
export type RiderRow = { itemId: string; name: string; paymentId: string; amount: string };

const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default function PaymentForm({
  itemId,
  termId,
  paymentId,
  d,
  methods,
  candidates,
  itemName,
  riders = [],
  mortgage,
}: {
  itemId: string;
  termId: string;
  paymentId: string | null;
  d: PaymentDefaults;
  methods: { id: string; label: string }[];
  candidates: { id: string; name: string }[]; // same group + vendor
  itemName: string;
  riders?: RiderRow[];
  mortgage?: MortgageDefaults;
}) {
  const { pending, run } = useAction();
  const [mainAmt, setMainAmt] = useState(withCommas(d.amountHkd));
  const [riderAmts, setRiderAmts] = useState<Record<string, string>>(Object.fromEntries(riders.map((r) => [r.itemId, withCommas(r.amount)])));
  const [mtg, setMtg] = useState(
    mortgage && { ...mortgage, interest: withCommas(mortgage.interest), principal: withCommas(mortgage.principal), balance: withCommas(mortgage.balance) },
  );
  // Rate or amount changed: interest, principal and balance are worked out again from the previous balance.
  const resplit = (rate: string, amount: string) => {
    if (!mtg) return;
    const r = num(rate);
    const a = num(amount);
    const next = { ...mtg, rate };
    if (mtg.prevBalance !== null && r > 0 && a > 0) {
      const x = splitInstalment(mtg.prevBalance, r, a);
      Object.assign(next, { interest: withCommas(String(x.interest)), principal: withCommas(String(x.principal)), balance: withCommas(String(x.balance)) });
    }
    setMtg(next);
  };
  const subtotal = num(mainAmt) + riders.reduce((sum, r) => sum + num(riderAmts[r.itemId] ?? ""), 0);

  const paidWith = (
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
  );
  const how = (
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
  );
  const paidOn = (
    <Field label="Paid on" htmlFor="paidAt">
      <input id="paidAt" name="paidAt" type="date" required defaultValue={d.paidAt} className={inputCls} />
    </Field>
  );
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
        {riders.length === 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {paidOn}
              <Field label="Amount (HKD)" htmlFor="amountHkd">
                <input
                  id="amountHkd"
                  name="amountHkd"
                  inputMode="decimal"
                  required
                  defaultValue={withCommas(d.amountHkd)}
                  onChange={(e) => {
                    setMainAmt(e.target.value);
                    if (mtg) resplit(mtg.rate, e.target.value);
                  }}
                  onBlur={commaBlur}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {paidWith}
              {how}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {paidOn}
              {paidWith}
            </div>
            {how}
            <Field label="Amount (HKD)" htmlFor="amountHkd" hint="Date, card and payment method above also apply to the rider.">
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="grid grid-cols-[1fr_8rem] items-center gap-2.5 px-2.5 py-2">
                  <span className="min-w-0 text-sm font-bold">{itemName}</span>
                  <input
                    id="amountHkd"
                    name="amountHkd"
                    inputMode="decimal"
                    required
                    value={mainAmt}
                    onChange={(e) => setMainAmt(e.target.value)}
                    onBlur={() => setMainAmt(withCommas(mainAmt))}
                    className={`${inputCls} text-right`}
                  />
                </div>
                {riders.map((r) => (
                  <div key={r.itemId} className="grid grid-cols-[1fr_8rem] items-center gap-2.5 border-t border-line bg-[#F6F6F3] px-2.5 py-2">
                    <span className="min-w-0 text-sm font-bold">
                      ↳ {r.name}
                      <span className="block text-xs font-semibold text-muted">Rider</span>
                    </span>
                    <input type="hidden" name={`riderPayment_${r.itemId}`} value={r.paymentId} />
                    <input
                      name={`rider_${r.itemId}`}
                      inputMode="decimal"
                      aria-label={`${r.name} amount (HKD)`}
                      value={riderAmts[r.itemId] ?? ""}
                      onChange={(e) => setRiderAmts({ ...riderAmts, [r.itemId]: e.target.value })}
                      onBlur={(e) => setRiderAmts({ ...riderAmts, [r.itemId]: withCommas(e.target.value) })}
                      className={`${inputCls} text-right`}
                    />
                  </div>
                ))}
                <div className="flex justify-between border-t border-line px-2.5 py-2.5 text-sm font-extrabold">
                  <span>This bill + rider</span>
                  <span>{money(Math.round(subtotal * 100) / 100)}</span>
                </div>
              </div>
            </Field>
          </>
        )}
        {candidates.length > 0 && (
          <>
            <Field
              label="Combined bill with"
              htmlFor="combinedWith"
              hint="Ticked combined bill(s) is/are logged with the same date and payment method, each for its own amount, and together share one combined total."
            >
              <div id="combinedWith" className="flex flex-col gap-1 rounded-[10px] border border-[#D5D8D1] bg-white px-3 py-1">
                {candidates.map((c) => (
                  <label key={c.id} className="flex min-h-11 items-center gap-3 text-[15px]">
                    <input
                      type="checkbox"
                      name="combinedWith"
                      value={c.id}
                      defaultChecked={d.combinedWith.includes(c.id)}
                      className="h-5 w-5 accent-brand"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Combined amount (HKD)" htmlFor="combinedTotal" hint="Total of the whole combined bill.">
              <input id="combinedTotal" name="combinedTotal" inputMode="decimal" defaultValue={withCommas(d.combinedTotal)} onBlur={commaBlur} className={inputCls} />
            </Field>
          </>
        )}
        {mtg && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Rate (% a year)" htmlFor="ratePct">
                <input id="ratePct" name="ratePct" inputMode="decimal" value={mtg.rate} onChange={(e) => resplit(e.target.value, mainAmt)} className={inputCls} />
              </Field>
              {(
                [
                  ["interestHkd", "interest", "Interest (HKD)"],
                  ["principalHkd", "principal", "Principal (HKD)"],
                  ["balanceHkd", "balance", "Balance after (HKD)"],
                ] as const
              ).map(([name, key, label]) => (
                <Field key={name} label={label} htmlFor={name}>
                  <input
                    id={name}
                    name={name}
                    inputMode="decimal"
                    value={mtg[key]}
                    onChange={(e) => setMtg({ ...mtg, [key]: e.target.value })}
                    onBlur={(e) => setMtg({ ...mtg, [key]: withCommas(e.target.value) })}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted">
              {mtg.prevBalance !== null
                ? `Interest = previous balance ${money(mtg.prevBalance)} × rate ÷ 12. Change the rate when the bank does; you can overwrite any figure.`
                : "No earlier balance recorded, so enter the figures from the bank statement."}
            </p>
          </div>
        )}
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
            if (confirm(riders.length ? "Delete this payment and its rider payments?" : "Delete this payment?")) {
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
