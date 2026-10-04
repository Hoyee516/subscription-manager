"use client";
import { saveMethod, setMethodActive } from "@/app/actions/methods";
import { useAction } from "./useAction";
import { Card, Field, btnPrimary, inputCls } from "./ui";

export default function MethodForm({
  id,
  d,
}: {
  id: string | null;
  d: { label: string; type: string; issuer: string; isActive: boolean };
}) {
  const { pending, run } = useAction();
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
