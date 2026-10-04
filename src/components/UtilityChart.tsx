"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/billing";

export type UtilityBillPoint = { id: string; month: string; amount: number; unpaid: boolean }; // month = "2026-07"; unpaid = has a due date, not paid

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Validated pair (CVD-safe); the lighter one is backed by the table view and labels.
const CUR = "#2a78d6";
const PREV = "#1baf7a";

function delta(cur?: number, prev?: number): string {
  if (cur == null || prev == null || prev === 0) return "";
  const p = (cur / prev - 1) * 100;
  if (Math.abs(p) < 0.05) return "▬ 0%";
  return `${p > 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`;
}

/** Year-on-year bars per billing month, with a table view linking to each bill. */
export default function UtilityChart({ bills, thisYear }: { bills: UtilityBillPoint[]; thisYear: number }) {
  // year → month (1–12) → { total, first bill id }
  const byYear = new Map<number, Map<number, { amount: number; id: string; unpaid: boolean }>>();
  for (const b of bills) {
    const y = Number(b.month.slice(0, 4));
    const m = Number(b.month.slice(5, 7));
    const ym = byYear.get(y) ?? new Map();
    const cur = ym.get(m);
    ym.set(m, cur ? { ...cur, amount: cur.amount + b.amount, unpaid: cur.unpaid || b.unpaid } : { amount: b.amount, id: b.id, unpaid: b.unpaid });
    byYear.set(y, ym);
  }
  const years = [...byYear.keys()];
  const latest = years.length ? Math.max(...years) : thisYear;
  const [year, setYear] = useState(Math.min(thisYear, latest));
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<number | null>(null);

  const cur = byYear.get(year) ?? new Map();
  const prev = byYear.get(year - 1) ?? new Map();
  const rows = [...new Set([...cur.keys(), ...prev.keys()])]
    .sort((a, b) => a - b)
    .map((m) => ({ m, cur: cur.get(m), prev: prev.get(m) }));

  const both = rows.filter((r) => r.cur && r.prev);
  const sameNow = both.reduce((s, r) => s + r.cur!.amount, 0);
  const samePrev = both.reduce((s, r) => s + r.prev!.amount, 0);
  const total = rows.reduce((s, r) => s + (r.cur?.amount ?? 0), 0);
  const complete = rows.every((r) => r.cur);
  const headDelta = delta(sameNow, samePrev);

  // Chart geometry (viewBox units)
  const W = 360, H = 210, L = 38, R = 4, T = 10, B = 44;
  const max = Math.max(1, ...rows.flatMap((r) => [r.cur?.amount ?? 0, r.prev?.amount ?? 0])) * 1.1;
  const step = Math.pow(10, Math.floor(Math.log10(max / 3)));
  const tick = [1, 2, 2.5, 5, 10].map((k) => k * step).find((t) => max / t <= 4) ?? max;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const band = (W - L - R) / Math.max(rows.length, 1);
  const bw = Math.min(22, (band - 14) / 2);
  const bar = (x: number, v: number | undefined, fill: string) => {
    if (v == null) return null;
    const h = Math.max(H - B - y(v), 1);
    const r = Math.min(4, h);
    const top = H - B - h;
    return (
      <path
        d={`M${x},${H - B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - B} Z`}
        fill={fill}
      />
    );
  };
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += tick) ticks.push(v);
  const act = active != null ? rows[active] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center text-sm font-extrabold">
          <button
            type="button"
            aria-label="Previous year"
            disabled={!byYear.has(year - 2)}
            onClick={() => (setYear(year - 1), setActive(null))}
            className="h-9 w-8 text-xl disabled:text-line"
          >
            ‹
          </button>
          {year} vs {year - 1}
          <button
            type="button"
            aria-label="Next year"
            disabled={year >= latest}
            onClick={() => (setYear(year + 1), setActive(null))}
            className="h-9 w-8 text-xl disabled:text-line"
          >
            ›
          </button>
        </div>
        <div className="flex gap-1 rounded-[10px] bg-[#ECEDE8] p-[3px]">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-extrabold capitalize ${view === v ? "bg-white text-ink" : "text-muted"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-[26px] font-extrabold">{money(total)}</span>
          {headDelta && <span className="text-[13px] font-extrabold">{headDelta} vs {year - 1}</span>}
        </p>
        <p className="text-xs text-muted">
          {year} {complete ? "total" : "so far"}
          {both.length > 0 && ` · same ${both.length} bill${both.length > 1 ? "s" : ""} in ${year - 1}: ${money(samePrev)}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">No bills in {year} or {year - 1}.</p>
      ) : view === "chart" ? (
        <>
          <div className="mt-1 flex gap-3.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PREV }} />
              {year - 1}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CUR }} />
              {year}
            </span>
          </div>
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`Bills by month, ${year} vs ${year - 1}`}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ECEDE8" strokeWidth={1} />
                  <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#5D6670">
                    {v >= 1000 ? `${v / 1000}k` : v}
                  </text>
                </g>
              ))}
              {rows.map((r, i) => {
                const cx = L + band * i + band / 2;
                return (
                  <g key={r.m} onClick={() => setActive(active === i ? null : i)} onMouseEnter={() => setActive(i)} className="cursor-pointer">
                    <rect x={L + band * i} y={T} width={band} height={H - T} fill="transparent" />
                    {bar(cx - bw - 1, r.prev?.amount, PREV)}
                    {bar(cx + 1, r.cur?.amount, CUR)}
                    <text x={cx} y={H - B + 15} textAnchor="middle" fontSize={11} fontWeight={700} fill="#15202B">
                      {M[r.m - 1]}
                    </text>
                    <text x={cx} y={H - B + 30} textAnchor="middle" fontSize={10} fontWeight={700} fill="#5D6670">
                      {delta(r.cur?.amount, r.prev?.amount)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {act ? (
            <div className="rounded-xl bg-[#F6F6F3] px-3 py-2.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="font-extrabold">{M[act.m - 1]}</span>
                <span className="text-xs font-extrabold">{delta(act.cur?.amount, act.prev?.amount)}</span>
              </div>
              {[
                { yr: year - 1, p: act.prev, c: PREV },
                { yr: year, p: act.cur, c: CUR },
              ].map(({ yr, p, c }) => (
                <div key={yr} className="mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted">
                    <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
                    {yr}
                  </span>
                  {p ? (
                    <Link href={`/utilities/bills/${p.id}`} className="font-bold text-brand">
                      {money(p.amount)} ›
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Tap a month to see and open its bills.</p>
          )}
        </>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1.5 text-left font-extrabold">Month</th>
              <th className="py-1.5 text-right font-extrabold">{year - 1}</th>
              <th className="py-1.5 text-right font-extrabold">{year}</th>
              <th className="py-1.5 text-right font-extrabold">YoY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m} className="border-b border-[#EEEFEA]">
                <td className="py-2.5 font-bold">{M[r.m - 1]}</td>
                <td className="py-2.5 text-right">
                  {r.prev ? (
                    <Link href={`/utilities/bills/${r.prev.id}`} className="text-muted">
                      {money(r.prev.amount)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {r.cur ? (
                    <Link href={`/utilities/bills/${r.cur.id}`} className="font-bold text-brand">
                      {money(r.cur.amount)}
                      {r.cur.unpaid && <span className="block text-[11px] font-semibold text-hike-ink">not paid</span>}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 text-right text-xs font-bold">{delta(r.cur?.amount, r.prev?.amount) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
