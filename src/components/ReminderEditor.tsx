"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { saveReminders } from "@/app/actions/items";
import type { LeadUnitName } from "@/lib/billing";
import { useAction } from "./useAction";
import { btnPrimary } from "./ui";

type Rem = { offset: number; unit: LeadUnitName };

const UNIT_LABEL: Record<LeadUnitName, string> = { HOUR: "Hour", DAY: "Day", WEEK: "Week", MONTH: "Month" };

export default function ReminderEditor({
  target,
  initial,
  allowHours = false,
  beforeWhat = "due date",
}: {
  target: { itemId: string } | { utilityId: string };
  initial: Rem[];
  allowHours?: boolean;
  beforeWhat?: string;
}) {
  const [rems, setRems] = useState<Rem[]>(initial);
  const [dirty, setDirty] = useState(false);
  const { pending, run } = useAction();
  const units: LeadUnitName[] = allowHours ? ["HOUR", "DAY", "WEEK", "MONTH"] : ["DAY", "WEEK", "MONTH"];

  const update = (i: number, patch: Partial<Rem>) => {
    setRems((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {rems.length === 0 && <p className="text-sm text-muted">No reminders yet.</p>}

      {rems.map((r, i) => {
        const word = r.unit.toLowerCase() + (r.offset === 1 ? "" : "s");
        return (
          <div key={i} className="flex flex-col gap-1.5 border-b border-[#EEEFEA] pb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-[10px] border border-[#D5D8D1]">
                <button type="button" aria-label="Fewer" className="h-11 w-10 bg-[#F6F6F3] text-lg font-bold" onClick={() => update(i, { offset: Math.max(1, r.offset - 1) })}>
                  −
                </button>
                <span className="w-9 text-center font-extrabold">{r.offset}</span>
                <button type="button" aria-label="More" className="h-11 w-10 bg-[#F6F6F3] text-lg font-bold" onClick={() => update(i, { offset: Math.min(99, r.offset + 1) })}>
                  +
                </button>
              </div>
              <div className="flex flex-1 gap-0.5 rounded-[10px] bg-[#ECEDE8] p-[3px]" role="radiogroup" aria-label="Unit">
                {units.map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={r.unit === u}
                    onClick={() => update(i, { unit: u })}
                    className={`min-h-10 flex-1 rounded-lg text-[13px] font-bold ${r.unit === u ? "bg-ink text-white" : "text-[#56606B]"}`}
                  >
                    {UNIT_LABEL[u]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="Remove reminder"
                className="flex h-11 w-9 items-center justify-center text-muted"
                onClick={() => {
                  setRems((rs) => rs.filter((_, j) => j !== i));
                  setDirty(true);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-muted">
              {r.offset} {word} before {beforeWhat}
            </p>
          </div>
        );
      })}

      {rems.length < 5 && (
        <button
          type="button"
          className="min-h-11 rounded-[10px] border border-dashed border-[#A9B0A6] text-sm font-bold text-brand"
          onClick={() => {
            setRems((rs) => [...rs, { offset: 1, unit: "WEEK" }]);
            setDirty(true);
          }}
        >
          + Add reminder
        </button>
      )}

      {dirty && (
        <button
          type="button"
          disabled={pending}
          className={btnPrimary}
          onClick={() =>
            run(() => saveReminders(target, rems), {
              success: "Reminders saved",
            })
          }
        >
          {pending ? "Saving…" : "Save reminders"}
        </button>
      )}
    </div>
  );
}
