import { money } from "@/lib/billing";

const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** One bar per year with its total and the change from the year before; unpaid years are lighter. */
export default function YearBars({ rows, color }: { rows: { label: string; total: number; paid: boolean }[]; color: string }) {
  const W = 360, H = 200, T = 28, B = 24, L = 38, R = 6;
  const max = Math.max(1, ...rows.map((r) => r.total)) * 1.05;
  const step = Math.pow(10, Math.floor(Math.log10(max / 3)));
  const tick = [1, 2, 2.5, 5, 10].map((k) => k * step).find((t) => max / t <= 4) ?? max;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += tick) ticks.push(v);
  const top = ticks[ticks.length - 1] < max ? ticks[ticks.length - 1] + tick : ticks[ticks.length - 1];
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const band = (W - L - R) / Math.max(rows.length, 1);
  const bw = Math.min(56, band * 0.55);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Total per year">
      {[...ticks, ...(top > ticks[ticks.length - 1] ? [top] : [])].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#C9CEC6" : "#ECEDE8"} />
          <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize={9.5} fill="#5D6670">
            {short(v)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cx = L + band * i + band / 2;
        const prev = rows[i - 1];
        const pct = prev && prev.total > 0 ? (r.total / prev.total - 1) * 100 : null;
        const h = y(0) - y(r.total);
        const rr = Math.min(4, h);
        const x0 = cx - bw / 2;
        const x1 = cx + bw / 2;
        return (
          <g key={r.label}>
            <path
              d={`M${x0},${y(0)} V${y(r.total) + rr} Q${x0},${y(r.total)} ${x0 + rr},${y(r.total)} H${x1 - rr} Q${x1},${y(r.total)} ${x1},${y(r.total) + rr} V${y(0)} Z`}
              fill={color}
              fillOpacity={r.paid ? 1 : 0.45}
            >
              <title>{`${r.label} · ${money(Math.round(r.total))}${r.paid ? "" : " · not fully paid yet"}`}</title>
            </path>
            <text x={cx} y={y(r.total) - 6} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#15202B">
              {money(Math.round(r.total))}
            </text>
            {pct !== null && (
              <text x={cx} y={y(r.total) - 19} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={pct > 0 ? "#9A3412" : "#0B5D52"}>
                {pct > 0 ? "+" : "−"}
                {Math.abs(pct).toFixed(1)}%
              </text>
            )}
            <text x={cx} y={H - B + 15} textAnchor="middle" fontSize={10} fontWeight={700} fill="#15202B">
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
