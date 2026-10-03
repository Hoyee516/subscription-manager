"use client";
import { CURRENCIES, CYCLE_UNITS } from "@/lib/billing";
import { Field, inputCls } from "./ui";

export type TermDefaults = {
  startDate: string;
  endDate: string;
  dueDate: string;
  amount: string;
  currency: string;
  amountHkd: string;
  cycleUnit: string;
  cycleCount: string;
  notes: string;
};

export const emptyTerm: TermDefaults = {
  startDate: "",
  endDate: "",
  dueDate: "",
  amount: "",
  currency: "HKD",
  amountHkd: "",
  cycleUnit: "MONTH",
  cycleCount: "1",
  notes: "",
};

/** Inputs for one term. Field names match readTermFields() in actions/items.ts. */
export default function TermFields({ d }: { d: TermDefaults }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Amount" htmlFor="amount">
          <input id="amount" name="amount" inputMode="decimal" required defaultValue={d.amount} className={inputCls} />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <select id="currency" name="currency" defaultValue={d.currency} className={inputCls}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Every" htmlFor="cycleCount">
          <input id="cycleCount" name="cycleCount" type="number" min={1} defaultValue={d.cycleCount} className={inputCls} />
        </Field>
        <Field label="Cycle" htmlFor="cycleUnit">
          <select id="cycleUnit" name="cycleUnit" defaultValue={d.cycleUnit} className={inputCls}>
            {CYCLE_UNITS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Term start" htmlFor="startDate">
          <input id="startDate" name="startDate" type="date" required defaultValue={d.startDate} className={inputCls} />
        </Field>
        <Field label="Term end" htmlFor="endDate">
          <input id="endDate" name="endDate" type="date" defaultValue={d.endDate} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Payment due" htmlFor="dueDate">
          <input id="dueDate" name="dueDate" type="date" defaultValue={d.dueDate} className={inputCls} />
        </Field>
        <Field label="HKD equivalent" htmlFor="amountHkd">
          <input id="amountHkd" name="amountHkd" inputMode="decimal" placeholder="If billed in USD" defaultValue={d.amountHkd} className={inputCls} />
        </Field>
      </div>
      <Field label="Term notes" htmlFor="termNotes">
        <input id="termNotes" name="termNotes" defaultValue={d.notes} className={inputCls} />
      </Field>
    </>
  );
}
