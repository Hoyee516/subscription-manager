"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/billing";

export type PriceRow = { id: string; name: string; perYear: number; pct: number | null; detail: string };

/** One row per bill: name, bar, yearly cost; a rise shows in orange. Tap a row for its details. */
export default function PriceBars({ rows }: { rows: PriceRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.perYear));
  const total = rows.reduce((s, r) => s + r.perYear, 0);
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-extrabold tracking-tight">{money(Math.round(total))} a year</span>
        <span className="text-xs text-muted">
          across {rows.length} {rows.length === 1 ? "bill" : "bills"}
        </span>
      </p>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const isOpen = open === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.id)}
                className={`grid min-h-[30px] w-full grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-1 text-left text-[13px] ${isOpen ? "bg-[#F6F6F3]" : ""}`}
              >
                <span className="truncate font-bold">{r.name}</span>
                <span className="h-2.5 rounded-r bg-[#1BAF7A]" style={{ width: `${Math.max((r.perYear / max) * 100, 2)}%` }} />
                <span className="flex items-center justify-end gap-1.5 font-bold">
                  {r.pct !== null && r.pct > 0.5 && (
                    <span className="rounded-full bg-hike-soft px-1.5 text-[10.5px] text-hike-ink">+{r.pct.toFixed(0)}%</span>
                  )}
                  {money(Math.round(r.perYear))}
                </span>
              </button>
              {isOpen && (
                <p className="flex flex-wrap items-center justify-between gap-x-3 px-1 pb-1.5 pt-0.5 text-xs text-muted">
                  <span>{r.detail}</span>
                  <Link href={`/bills/${r.id}`} className="font-bold text-brand">
                    Open bill ›
                  </Link>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
