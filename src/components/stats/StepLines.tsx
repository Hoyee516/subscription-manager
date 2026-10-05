import { money } from "@/lib/billing";

export type StepSeries = {
  key: string;
  name: string;
  color: string;
  steps: { start: Date; end: Date | null; monthly: number }[];
};

const yr = (d: Date) => d.getUTCFullYear() + (d.getUTCMonth() + (d.getUTCDate() - 1) / 31) / 12;

/** Price per month over time, one step per contract term; dashed line marks today. */
export default function StepLines({ series, today }: { series: StepSeries[]; today: Date }) {
  const W = 360, H = 200, T = 12, B = 24, L = 34, R = 10;
  const ends = series.flatMap((s) => s.steps.map((t, i) => (s.steps[i + 1] ? s.steps[i + 1].start : (t.end ?? today))));
  const x0 = Math.floor(Math.min(...series.flatMap((s) => s.steps.map((t) => yr(t.start)))));
  const x1 = Math.ceil(Math.max(yr(today), ...ends.map(yr)));
  const vals = series.flatMap((s) => s.steps.map((t) => t.monthly));
  const span = Math.max(...vals) - Math.min(...vals);
  const tick = [10, 25, 50, 100, 250, 500, 1000].find((t) => (span * 1.6) / t <= 6) ?? 1000;
  const lo = Math.max(0, Math.floor((Math.min(...vals) - span * 0.3 - 1) / tick) * tick);
  const hi = Math.ceil((Math.max(...vals) + span * 0.3 + 1) / tick) * tick;
  const x = (v: number) => L + ((W - L - R) * (v - x0)) / Math.max(x1 - x0, 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += tick) ticks.push(v);
  const yearStep = Math.ceil((x1 - x0) / 6);
  const years: number[] = [];
  for (let v = x0; v <= x1; v += yearStep) years.push(v);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Monthly price per contract over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ECEDE8" />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize={9.5} fill="#5D6670">
              {v}
            </text>
          </g>
        ))}
        {years.map((v, i) => (
          <text key={v} x={x(v)} y={H - B + 15} textAnchor={i === years.length - 1 && x(v) > W - R - 12 ? "end" : "middle"} fontSize={10} fontWeight={700} fill="#15202B">
            {v}
          </text>
        ))}
        <line x1={x(yr(today))} x2={x(yr(today))} y1={T} y2={H - B} stroke="#C9CEC6" strokeDasharray="3 3" />
        <text x={x(yr(today)) + 3} y={T + 8} fontSize={9} fill="#5D6670">
          Today
        </text>
        {series.map((s) => {
          const pts: string[] = [];
          s.steps.forEach((t, i) => {
            const end = s.steps[i + 1] ? s.steps[i + 1].start : (t.end ?? today);
            pts.push(`${x(yr(t.start))},${y(t.monthly)}`, `${x(yr(end))},${y(t.monthly)}`);
          });
          const last = s.steps[s.steps.length - 1];
          const lastEnd = last.end ?? today;
          return (
            <g key={s.key}>
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {s.steps.map((t) => (
                <circle key={t.start.toISOString()} cx={x(yr(t.start))} cy={y(t.monthly)} r={4} fill={s.color} stroke="#fff" strokeWidth={2}>
                  <title>{`${s.name} · ${money(Math.round(t.monthly))}/month from ${t.start.toISOString().slice(0, 7)}`}</title>
                </circle>
              ))}
              <text x={x(yr(lastEnd)) - 2} y={y(last.monthly) - 6} textAnchor="end" fontSize={10} fontWeight={800} fill="#15202B">
                {money(Math.round(last.monthly))}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-1 text-xs">
        {series.map((s) => {
          const a = s.steps[0];
          const b = s.steps[s.steps.length - 1];
          const pct = (b.monthly / a.monthly - 1) * 100;
          const flat = Math.abs(pct) < 0.5;
          return (
            <div key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-muted">
                <i className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
                <span>
                  {s.name} · {money(Math.round(a.monthly))} → {money(Math.round(b.monthly))}/month
                </span>
              </span>
              <span
                className={`whitespace-nowrap rounded-full px-2 text-[11px] font-bold ${
                  flat ? "bg-[#E9EAE6] text-[#45505A]" : pct > 0 ? "bg-hike-soft text-hike-ink" : "bg-brand-soft text-brand"
                }`}
              >
                {flat ? "No change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%`} since {a.start.getUTCFullYear()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
