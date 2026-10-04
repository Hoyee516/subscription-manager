import Link from "next/link";
import { money } from "@/lib/billing";

/** Ranked horizontal bars with the value at the end. */
export default function HBars({ rows }: { rows: { key: string; name: string; value: number; color: string; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="truncate">{r.name}</span>
            <span className="h-3 rounded-r" style={{ width: `${Math.max((r.value / max) * 100, 1)}%`, background: r.color }} />
            <span className="text-right font-bold">{money(Math.round(r.value))}</span>
          </>
        );
        const cls = "grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-2 text-xs";
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
