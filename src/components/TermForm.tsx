"use client";
import { deleteTerm, saveTerm } from "@/app/actions/items";
import TermFields, { type TermDefaults } from "./TermFields";
import { CURRENCIES } from "@/lib/billing";
import { useAction } from "./useAction";
import { Card, SectionLabel, btnPrimary, inputCls, labelCls } from "./ui";

/** A rider's term for the same policy year: shares dates and cycle with the main term. */
export type RiderTermRow = { itemId: string; name: string; termId: string; amount: string; currency: string; amountHkd: string };

export default function TermForm({
  itemId,
  termId,
  d,
  riders = [],
}: {
  itemId: string;
  termId: string | null;
  d: TermDefaults;
  riders?: RiderTermRow[];
}) {
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveTerm(itemId, termId, fd), { success: termId ? "Term saved" : "New term added", goTo: () => `/bills/${itemId}` });
      }}
    >
      <Card className="flex flex-col gap-3.5">
        <TermFields d={d} />
      </Card>
      {riders.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <SectionLabel>Riders</SectionLabel>
            <p className="mt-1 text-xs text-muted">
              Term start, end, payment due and cycle above apply to riders too. Leave a rider&apos;s amount blank to leave it unchanged.
            </p>
          </div>
          {riders.map((r) => (
            <div key={r.itemId} className="flex flex-col gap-2 rounded-xl bg-[#F6F6F3] p-2.5">
              <span className="text-sm font-bold">↳ {r.name}</span>
              <input type="hidden" name={`riderTerm_${r.itemId}`} value={r.termId} />
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input
                  name={`riderAmount_${r.itemId}`}
                  inputMode="decimal"
                  aria-label={`${r.name} amount`}
                  placeholder="Amount"
                  defaultValue={r.amount}
                  className={inputCls}
                />
                <select name={`riderCurrency_${r.itemId}`} aria-label={`${r.name} currency`} defaultValue={r.currency} className={inputCls}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>HKD equivalent</span>
                <input
                  name={`riderHkd_${r.itemId}`}
                  inputMode="decimal"
                  placeholder="If billed in USD"
                  defaultValue={r.amountHkd}
                  className={inputCls}
                />
              </label>
            </div>
          ))}
        </Card>
      )}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : termId ? "Save term" : "Add term"}
      </button>
      {termId && (
        <button
          type="button"
          disabled={pending}
          className="py-2 text-[13px] font-bold text-hike-ink"
          onClick={() => {
            if (confirm(riders.length ? "Delete this term, its riders' terms for the same year, and their payments?" : "Delete this term and its payments?")) {
              run(() => deleteTerm(termId), { success: "Term deleted", goTo: () => `/bills/${itemId}` });
            }
          }}
        >
          Delete term
        </button>
      )}
    </form>
  );
}
