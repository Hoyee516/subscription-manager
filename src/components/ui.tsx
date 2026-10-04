import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Shared visual pieces matching the approved mockup.

export const inputCls =
  "min-h-11 w-full rounded-[10px] border border-[#D5D8D1] bg-white px-3 text-[15px] text-ink outline-none focus:border-brand";
export const labelCls = "text-[13px] font-bold text-[#3C4650]";
export const btnPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-60";
export const btnSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-[#D5D8D1] bg-white px-4 text-sm font-bold text-ink disabled:opacity-60";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white p-4 ${className}`}>{children}</section>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted">{children}</h2>;
}

const PILL = {
  teal: "bg-brand-soft text-brand",
  orange: "bg-hike-soft text-hike-ink",
  blue: "bg-info-soft text-info",
  grey: "bg-[#E9EAE6] text-[#45505A]",
  purple: "bg-[#E8E2F4] text-[#4B3780]",
  pink: "bg-[#F8E1EC] text-[#8E2457]",
  yellow: "bg-[#FBF0C2] text-[#735A00]",
} as const;

export type PillTone = keyof typeof PILL;

/** Colour per category group (bills list headers). */
export function groupTone(group: string, isSavings = false): PillTone {
  if (isSavings) return "purple";
  const map: Record<string, PillTone> = {
    Insurance: "orange",
    Telecom: "blue",
    Software: "teal",
    "Creator Tools": "pink",
    Memberships: "yellow",
  };
  return map[group] ?? "grey";
}

export function Pill({ tone = "grey", children }: { tone?: PillTone; children: React.ReactNode }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${PILL[tone]}`}>{children}</span>
  );
}

export function BackBar({ href, label, right }: { href: string; label: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <Link
        href={href}
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white"
      >
        <ChevronLeft size={20} />
      </Link>
      {right}
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
