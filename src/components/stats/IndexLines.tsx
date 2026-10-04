/** Lines indexed to 100 at each series' first point; one shared axis. */
export default function IndexLines({
  series,
}: {
  series: { key: string; name: string; color: string; points: { year: number; index: number }[] }[];
}) {
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);
  const all = series.flatMap((s) => s.points.map((p) => p.index));
  const lo = Math.min(90, Math.floor(Math.min(...all) / 10) * 10);
  const hi = Math.max(110, Math.ceil(Math.max(...all) / 10) * 10 + 10);
  const W = 360, H = 200, T = 10, B = 24, L = 34, R = 22;
  const x = (yr: number) => L + ((W - L - R) * (yr - years[0])) / Math.max(years[years.length - 1] - years[0], 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const step = hi - lo > 150 ? 50 : 25;
  const grid: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  const labelYears = years.filter((_, i) => i % Math.ceil(years.length / 5) === 0 || i === years.length - 1);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Premium growth, first year = 100">
        {grid.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke={v === 100 ? "#C9CEC6" : "#ECEDE8"} />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize={9.5} fill="#5D6670">
              {v}
            </text>
          </g>
        ))}
        {labelYears.map((yr) => (
          <text key={yr} x={x(yr)} y={H - B + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#15202B">
            {yr}
          </text>
        ))}
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.key}>
              <polyline points={s.points.map((p) => `${x(p.year)},${y(p.index)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(last.year)} cy={y(last.index)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-1 text-xs">
        {series.map((s) => {
          const first = s.points[0];
          const last = s.points[s.points.length - 1];
          const pct = last.index - 100;
          return (
            <div key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-muted">
                <i className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="font-bold">
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(0)}% since {first.year}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
