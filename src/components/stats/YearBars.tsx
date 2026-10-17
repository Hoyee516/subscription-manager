import { money } from "@/lib/billing";

/**
 * One horizontal row per year, newest first: the bar, its total and the change from the year before.
 * Unpaid years are lighter. Rows instead of columns so many years stay readable on a phone.
 */
export default function YearBars({ rows, color }: { rows: { label: string; total: number; paid: boolean }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 1 && (
        <p className="text-xs text-muted">
          {rows.length} years · <span className="font-bold text-ink">{money(Math.round(first.total))}</span> ({first.label}) →{" "}
          <span className="font-bold text-ink">{money(Math.round(last.total))}</span> ({last.label})
        </p>
      )}
      <ul className="flex flex-col gap-1.5" aria-label="Total per year">
        {rows
          .map((r, i) => {
            const prev = rows[i - 1];
            const pct = prev && prev.total > 0 ? (r.total / prev.total - 1) * 100 : null;
            return { ...r, pct };
          })
          .reverse()
          .map((r) => (
            <li
              key={r.label}
              className="grid grid-cols-[3.25rem_1fr_5.25rem_3.25rem] items-center gap-2 text-xs"
              title={`${r.label} · ${money(Math.round(r.total))}${r.paid ? "" : " · not fully paid yet"}`}
            >
              <span className="font-bold tabular-nums">{r.label}</span>
              <span
                className="h-3 rounded-r"
                style={{ width: `${Math.max((r.total / max) * 100, 1)}%`, background: color, opacity: r.paid ? 1 : 0.45 }}
              />
              <span className="text-right font-bold tabular-nums">{money(Math.round(r.total))}</span>
              <span
                className="text-right font-bold tabular-nums"
                style={{ color: r.pct === null ? undefined : r.pct > 0 ? "#9A3412" : "#0B5D52" }}
              >
                {r.pct === null ? "" : `${r.pct > 0 ? "+" : "−"}${Math.abs(r.pct).toFixed(0)}%`}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
