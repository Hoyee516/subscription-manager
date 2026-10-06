"use client";
import { useState } from "react";
import { CURRENCIES, CYCLE_UNITS } from "@/lib/billing";
import { fmtDay, parseDay, todayHK } from "@/lib/dates";
import {
  DUE_RULE_LABEL,
  MONTH_NAMES,
  chargesEachCycle,
  nextCycleCharge,
  rulesFor,
  termChargeDate,
  type DueRuleName,
} from "@/lib/due";
import { commaBlur, Field, inputCls, withCommas } from "./ui";

export type TermDefaults = {
  startDate: string;
  endDate: string;
  dueDate: string;
  dueRule: string;
  dueDay: string;
  dueMonth: string;
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
  dueRule: "START_DATE",
  dueDay: "",
  dueMonth: "",
  amount: "",
  currency: "HKD",
  amountHkd: "",
  cycleUnit: "MONTH",
  cycleCount: "1",
  notes: "",
};

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/**
 * Inputs for one term. Field names match readTermFields() in actions/items.ts.
 * itemType decides how charges fall: every cycle (Recurring, Contract) or once per term.
 */
export default function TermFields({
  d,
  itemType,
  allowInstalments = false,
}: {
  d: TermDefaults;
  itemType: string;
  allowInstalments?: boolean;
}) {
  const [cycleUnit, setCycleUnit] = useState(d.cycleUnit);
  const [cycleCount, setCycleCount] = useState(d.cycleCount);
  const [startDate, setStartDate] = useState(d.startDate);
  const [endDate, setEndDate] = useState(d.endDate);
  const [rule, setRule] = useState(d.dueRule || "START_DATE");
  const [dueDay, setDueDay] = useState(d.dueDay);
  const [dueMonth, setDueMonth] = useState(d.dueMonth);
  const [dueDate, setDueDate] = useState(d.dueDate);

  const options = rulesFor(cycleUnit, allowInstalments || rule === "INSTALMENTS");
  const effective = (options.includes(rule as DueRuleName) ? rule : "START_DATE") as DueRuleName;

  // Picking a rule starts from the term start date, the usual answer.
  const pickRule = (r: string) => {
    setRule(r);
    const s = parseDay(startDate);
    if (!s) return;
    if ((r === "DAY_OF_MONTH" || r === "DAY_OF_YEAR") && !dueDay) setDueDay(String(s.getUTCDate()));
    if (r === "DAY_OF_YEAR" && !dueMonth) setDueMonth(String(s.getUTCMonth() + 1));
    if (r === "FIXED_DATE" && !dueDate) setDueDate(startDate);
  };

  const preview = (() => {
    if (effective === "INSTALMENTS") return "Charges follow the instalment dates below.";
    const s = parseDay(startDate);
    if (!s) return null;
    const t = {
      startDate: s,
      endDate: parseDay(endDate),
      dueDate: parseDay(dueDate),
      dueRule: effective,
      dueDay: parseInt(dueDay, 10) || null,
      dueMonth: parseInt(dueMonth, 10) || null,
      cycleUnit,
      cycleCount: Math.max(1, parseInt(cycleCount, 10) || 1),
    };
    const today = todayHK();
    if (chargesEachCycle(itemType, cycleUnit)) {
      const next = nextCycleCharge(t, today);
      return next ? `Next charge: ${fmtDay(next)}` : "No more charges in this term.";
    }
    const c = termChargeDate(t);
    return `${c < today ? "Charged on" : "Charge date"}: ${fmtDay(c)}`;
  })();

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Amount" htmlFor="amount">
          <input id="amount" name="amount" inputMode="decimal" required defaultValue={withCommas(d.amount)} onBlur={commaBlur} className={inputCls} />
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
          <input
            id="cycleCount"
            name="cycleCount"
            type="number"
            min={1}
            value={cycleCount}
            onChange={(e) => setCycleCount(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Cycle" htmlFor="cycleUnit">
          <select id="cycleUnit" name="cycleUnit" value={cycleUnit} onChange={(e) => setCycleUnit(e.target.value)} className={inputCls}>
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
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Term end" htmlFor="endDate">
          <input id="endDate" name="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Payment due" htmlFor="dueRule">
        <select id="dueRule" name="dueRule" value={effective} onChange={(e) => pickRule(e.target.value)} className={inputCls}>
          {options.map((r) => (
            <option key={r} value={r}>
              {DUE_RULE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      {effective === "DAY_OF_MONTH" && (
        <Field label="Day of month" htmlFor="dueDay" hint="29–31 fall on the last day of shorter months.">
          <select id="dueDay" name="dueDay" required value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={inputCls}>
            <option value="">Pick a day</option>
            {DAYS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
      )}
      {effective === "DAY_OF_YEAR" && (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Month" htmlFor="dueMonth">
            <select id="dueMonth" name="dueMonth" required value={dueMonth} onChange={(e) => setDueMonth(e.target.value)} className={inputCls}>
              <option value="">Pick a month</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Day" htmlFor="dueDay">
            <select id="dueDay" name="dueDay" required value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={inputCls}>
              <option value="">Pick a day</option>
              {DAYS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {effective === "FIXED_DATE" && (
        <Field label="Due date" htmlFor="dueDate">
          <input id="dueDate" name="dueDate" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </Field>
      )}
      {preview && <p className="rounded-[10px] bg-brand-soft px-3 py-2.5 text-[13px] font-bold text-brand">{preview}</p>}

      <Field label="HKD equivalent" htmlFor="amountHkd" hint="Leave blank to convert at the fixed rate (US$1 = HK$7.8, £1 = HK$10.37).">
        <input id="amountHkd" name="amountHkd" inputMode="decimal" placeholder="If not billed in HKD" defaultValue={withCommas(d.amountHkd)} onBlur={commaBlur} className={inputCls} />
      </Field>
      <Field label="Term notes" htmlFor="termNotes">
        <input id="termNotes" name="termNotes" defaultValue={d.notes} className={inputCls} />
      </Field>
    </>
  );
}
