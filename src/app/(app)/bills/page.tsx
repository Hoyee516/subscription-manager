import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { todayHK, fmtDay } from "@/lib/dates";
import { loadRates, toHkd } from "@/lib/fx";
import {
  cycleLabel,
  money,
  nextDate,
  urgency,
  URGENCY_BORDER,
  TYPE_LABEL,
  type CycleUnitName,
  type ItemTypeName,
} from "@/lib/billing";
import PageHeader from "@/components/PageHeader";
import { Pill, groupTone } from "@/components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "insurance", label: "Insurance" },
  { key: "telecom", label: "Telecom" },
  { key: "software", label: "Software & more" },
  { key: "trials", label: "Trials & one-offs" },
  { key: "ended", label: "Ended" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

type TermLike = { amount: { toString(): string }; currency: string; amountHkd: { toString(): string } | null };

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const userId = await requireUserId();
  const { f } = await searchParams;
  const filter: FilterKey = FILTERS.some((x) => x.key === f) ? (f as FilterKey) : "all";
  const today = todayHK();

  const items = await prisma.item.findMany({
    where: { userId, parentId: null },
    orderBy: [{ categoryGroup: "asc" }, { name: "asc" }],
    include: {
      paymentMethod: { select: { label: true } },
      terms: { orderBy: { startDate: "asc" } },
      riders: { include: { terms: { orderBy: { startDate: "desc" }, take: 1 } } },
    },
  });

  const rates = await loadRates(
    items.flatMap((i) => [...i.terms.slice(-1), ...i.riders.flatMap((r) => r.terms)].map((t) => t.currency))
  );

  // HKD first; original currency underneath when it isn't HKD.
  const amounts = (t: TermLike | undefined) => {
    if (!t) return { main: "—", original: null as string | null };
    const amt = Number(t.amount);
    const { hkd, approx } = toHkd(amt, t.currency, t.amountHkd ? Number(t.amountHkd) : null, rates);
    if (t.currency === "HKD") return { main: money(amt), original: null };
    return {
      main: hkd !== null ? `${approx ? "≈" : ""}${money(hkd)}` : money(amt, t.currency),
      original: hkd !== null ? `(${money(amt, t.currency)})` : null,
    };
  };

  const rows = items
    .filter((i) => {
      // A trial, one-off or prepaid bill whose last term has ended counts as ended,
      // even if its status was never changed.
      const last = i.terms[i.terms.length - 1];
      const lapsed =
        ["TRIAL", "PASS", "PREPAID"].includes(i.type) && !!last?.endDate && last.endDate < today;
      const active = i.status === "ACTIVE" && !lapsed;
      const tp = i.type === "TRIAL" || i.type === "PASS";
      switch (filter) {
        case "ended":
          return !active;
        case "trials":
          return tp;
        case "insurance":
          return active && i.categoryGroup === "Insurance";
        case "telecom":
          return active && i.categoryGroup === "Telecom";
        case "software":
          return active && !["Insurance", "Telecom"].includes(i.categoryGroup);
        default:
          return active;
      }
    })
    .map((i) => {
      const type = i.type as ItemTypeName;
      const t = i.terms[i.terms.length - 1];
      const nd = nextDate(type, i.status === "ACTIVE", i.terms, today);
      // A pass, trial or prepaid term that has already ended has nothing coming up.
      const nothingAhead = nd?.past && (type === "PASS" || type === "TRIAL" || type === "PREPAID");
      return {
        id: i.id,
        name: i.name,
        vendor: i.vendor,
        group: i.categoryGroup,
        groupKey: i.isSavings ? `${i.categoryGroup} · savings-type` : i.categoryGroup,
        type,
        status: i.status,
        isSavings: i.isSavings,
        autoRenew: i.autoRenew,
        ...amounts(t),
        cycle: t ? cycleLabel(t.cycleUnit as CycleUnitName, t.cycleCount) : "",
        card: i.paymentMethod?.label ?? null,
        next: nd ? `${nd.label} ${fmtDay(nd.date)}` : i.status === "CANCELLED" ? "Cancelled" : i.status === "ENDED" ? "Ended" : "",
        urgency: nothingAhead ? null : urgency(nd?.date, today),
        riders: i.riders.map((r) => ({ id: r.id, name: r.name, ...amounts(r.terms[0]) })),
      };
    });

  const groups = Map.groupBy(rows, (r) => r.groupKey);
  // Fixed order; any other group (e.g. Creator Tools) follows alphabetically.
  const ORDER = ["Insurance", "Insurance · savings-type", "Telecom", "Memberships", "Software"];
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Bills" sub={`${rows.length} item${rows.length === 1 ? "" : "s"}`} />
        <Link href="/bills/new" aria-label="Add item" className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
          <Plus size={22} strokeWidth={2.4} />
        </Link>
      </div>

      <nav className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filter">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/bills" : `/bills?f=${x.key}`}
            aria-current={filter === x.key ? "page" : undefined}
            className={`flex min-h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold ${
              filter === x.key ? "border-ink bg-ink text-white" : "border-[#D5D8D1] bg-white text-[#3C4650]"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <p className="mb-4 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#D64545]" />Under 1 month</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#E08A3C]" />1–3 months</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3B9B6D]" />3+ months</span>
      </p>

      {rows.length === 0 && <p className="px-1 text-sm text-muted">Nothing here.</p>}

      <div className="flex flex-col gap-5">
        {order.map((key) => {
          const list = groups.get(key)!;
          const first = list[0];
          return (
            <section key={key} className="flex flex-col gap-2">
              <div className="px-1">
                <Pill tone={groupTone(first.group, first.isSavings)}>{first.isSavings ? `${first.group} · savings-type` : first.group}</Pill>
              </div>
              <ul className="flex flex-col gap-2">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/bills/${r.id}`}
                      className={`flex gap-3 rounded-2xl bg-white px-4 py-3 ${r.urgency ? `border-2 ${URGENCY_BORDER[r.urgency]}` : "border border-line"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{r.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {r.vendor}
                          {r.next && ` · ${r.next}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Pill>{r.isSavings ? "Savings" : TYPE_LABEL[r.type]}</Pill>
                          {r.autoRenew && <Pill tone="teal">Auto-renew</Pill>}
                          {r.status === "ACTIVE" && (r.card ? <Pill>{r.card}</Pill> : <Pill tone="orange">No card set</Pill>)}
                        </div>
                        {r.riders.map((rd) => (
                          <p key={rd.id} className="mt-2 flex justify-between gap-2 rounded-lg bg-[#F6F6F3] px-2.5 py-1.5 text-xs text-muted">
                            <span>↳ {rd.name}</span>
                            <span className="text-right">
                              <span className="font-bold text-ink">{rd.main}</span>
                              {rd.original && <span className="block">{rd.original}</span>}
                            </span>
                          </p>
                        ))}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold">{r.main}</p>
                        {r.original && <p className="text-xs text-muted">{r.original}</p>}
                        <p className="text-xs text-muted">{r.cycle}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
