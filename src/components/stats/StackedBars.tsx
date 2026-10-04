"use client";
import { useState } from "react";
import { money } from "@/lib/billing";

export type Series = { key: string; label: string; color: string };
export type Column = { label: string; sub?: string; parts: Partial<Record<string, number>> };

const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** Stacked columns (one baseline, one axis); tap a column for its exact figures. */
export default function StackedBars({ columns, series, average }: { columns: Column[]; series: Series[]; average?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = columns.map((c) => series.reduce((s, x) => s + (c.parts[x.key] ?? 0), 0));
  const avg = totals.reduce((a, b) => a + b, 0) / Math.max(totals.length, 1);
  const W = 360, H = 200, T = 10, B = 24, L = 36;
  const max = Math.max(1, ...totals) * 1.08;
  const step = Math.pow(10, Math.floor(Math.log10(max / 3)));
  const tick = [1, 2, 2.5, 5, 10].map((k) => k * step).find((t) => max / t <= 4) ?? max;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += tick) ticks.push(v);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const band = (W - L) / Math.max(columns.length, 1);
  const bw = Math.min(28, band - 8);
  const used = series.filter((s) => totals.some((_, i) => (columns[i].parts[s.key] ?? 0) > 0));
  const act = active != null ? columns[active] : null;

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#ECEDE8" />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize={9.5} fill="#5D6670">
              {short(v)}
            </text>
          </g>
        ))}
        {columns.map((c, i) => {
          const x = L + band * i + (band - bw) / 2;
          let top = H - B;
          const segs = series.filter((s) => (c.parts[s.key] ?? 0) > 0);
          return (
            <g key={i} onClick={() => setActive(active === i ? null : i)} className="cursor-pointer">
              <rect x={L + band * i} y={T} width={band} height={H - T} fill="transparent" />
              {segs.map((s, k) => {
                const h = ((H - T - B) * (c.parts[s.key] ?? 0)) / max;
                top -= h;
                return (
                  <rect key={s.key} x={x} y={top} width={bw} height={Math.max(h - 1.5, 0.5)} rx={k === segs.length - 1 ? 3 : 0} fill={s.color} opacity={active == null || active === i ? 1 : 0.45} />
                );
              })}
              <text x={x + bw / 2} y={H - B + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#15202B">
                {c.label}
              </text>
            </g>
          );
        })}
        {average && avg > 0 && (
          <g>
            <line x1={L} x2={W} y1={y(avg)} y2={y(avg)} stroke="#15202B" strokeDasharray="4 3" strokeWidth={1.5} />
            <text x={W} y={y(avg) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill="#15202B">
              avg {short(avg)}
            </text>
          </g>
        )}
      </svg>
      {used.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {used.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {act ? (
        <div className="rounded-xl bg-[#F6F6F3] px-3 py-2.5 text-[13px]">
          <div className="flex justify-between font-extrabold">
            <span>
              {act.label}
              {act.sub ? ` ${act.sub}` : ""}
            </span>
            <span>{money(Math.round(totals[active!]))}</span>
          </div>
          {series
            .filter((s) => (act.parts[s.key] ?? 0) > 0)
            .map((s) => (
              <div key={s.key} className="mt-1 flex justify-between text-muted">
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span>{money(Math.round(act.parts[s.key]!))}</span>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-xs text-muted">Tap a bar for the exact figures.</p>
      )}
    </div>
  );
}
