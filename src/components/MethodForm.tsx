"use client";
import { saveMethod, setMethodActive } from "@/app/actions/methods";
import { useAction } from "./useAction";
import { Card, Field, btnPrimary, inputCls } from "./ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function MethodForm({
  id,
  d,
}: {
  id: string | null;
  d: { label: string; type: string; issuer: string; isActive: boolean; expiryMonth: number | null; expiryYear: number | null };
}) {
  const { pending, run } = useAction();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, k) => thisYear - 1 + k);
  if (d.expiryYear && !years.includes(d.expiryYear)) years.unshift(d.expiryYear);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveMethod(id, fd), { success: id ? "Saved" : "Payment method added", goTo: () => "/cards" });
      }}
    >
      <Card className="flex flex-col gap-3.5">
        <Field label="Name" htmlFor="label" hint="As it should appear on bills, e.g. HSBC Everymile.">
          <input id="label" name="label" required defaultValue={d.label} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" defaultValue={d.type} className={inputCls}>
              <option value="CARD">Card</option>
              <option value="BANK">Bank / FPS</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Issuer" htmlFor="issuer">
            <input id="issuer" name="issuer" defaultValue={d.issuer} placeholder="Optional" className={inputCls} />
          </Field>
        </div>
        <Field label="Expires" htmlFor="expiryMonth" hint="For the card-expiring alert. Leave blank for FPS or bank accounts.">
          <div className="grid grid-cols-2 gap-2.5">
            <select id="expiryMonth" name="expiryMonth" defaultValue={d.expiryMonth ?? ""} className={inputCls} aria-label="Expiry month">
              <option value="">Month</option>
              {MONTHS.map((m, k) => (
                <option key={m} value={k + 1}>
                  {String(k + 1).padStart(2, "0")} · {m}
                </option>
              ))}
            </select>
            <select name="expiryYear" defaultValue={d.expiryYear ?? ""} className={inputCls} aria-label="Expiry year">
              <option value="">Year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </Card>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : id ? "Save" : "Add payment method"}
      </button>
      {id && (
        <button
          type="button"
          disabled={pending}
          className="py-2 text-[13px] font-bold text-muted"
          onClick={() =>
            run(() => setMethodActive(id, !d.isActive), {
              success: d.isActive ? "Archived" : "Restored",
              goTo: () => "/cards",
            })
          }
        >
          {d.isActive ? "Archive (hide from pickers)" : "Restore"}
        </button>
      )}
    </form>
  );
}
