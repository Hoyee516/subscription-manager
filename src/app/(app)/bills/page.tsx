import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { todayHK, fmtDay } from "@/lib/dates";
import { cycleLabel, money, nextDate, TYPE_LABEL, type CycleUnitName, type ItemTypeName } from "@/lib/billing";
import PageHeader from "@/components/PageHeader";
import { Pill, SectionLabel } from "@/components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "insurance", label: "Insurance" },
  { key: "telecom", label: "Telecom" },
  { key: "software", label: "Software & more" },
  { key: "trials", label: "Trials & passes" },
  { key: "ended", label: "Ended" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const userId = await requireUserId();
  const { f } = await searchParams;
  const filter: FilterKey = FILTERS.some((x) => x.key === f) ? (f as FilterKey) : "all";
  const today = todayHK();

  const items = await prisma.item.findMany({
    where: { userId, parentId: null },
    orderBy: [{ categoryGroup: "asc" }, { name: "asc" }],
    include: {
      terms: { orderBy: { startDate: "asc" }, include: { paymentMethod: { select: { label: true } } } },
      riders: { include: { terms: { orderBy: { startDate: "desc" }, take: 1 } } },
    },
  });

  const rows = items
    .filter((i) => {
      const active = i.status === "ACTIVE";
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
          return active && !tp && !["Insurance", "Telecom"].includes(i.categoryGroup);
        default:
          return active && !tp;
      }
    })
    .map((i) => {
      const t = i.terms[i.terms.length - 1];
      const nd = nextDate(i.type as ItemTypeName, i.status === "ACTIVE", i.terms, today);
      return {
        id: i.id,
        name: i.name,
        vendor: i.vendor,
        group: i.isSavings ? `${i.categoryGroup} · savings-type` : i.categoryGroup,
        type: i.type as ItemTypeName,
        status: i.status,
        isSavings: i.isSavings,
        autoRenew: i.autoRenew,
        amount: t ? money(Number(t.amount), t.currency) : "—",
        cycle: t ? cycleLabel(t.cycleUnit as CycleUnitName, t.cycleCount) : "",
        card: t?.paymentMethod?.label ?? null,
        next: nd ? `${nd.label} ${fmtDay(nd.date)}` : i.status === "ACTIVE" ? "" : i.status === "CANCELLED" ? "Cancelled" : "Ended",
        overdue: nd?.past && (i.type === "POLICY" || i.type === "RECURRING"),
        riders: i.riders.map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.terms[0] ? money(Number(r.terms[0].amount), r.terms[0].currency) : "—",
        })),
      };
    });

  const groups = Map.groupBy(rows, (r) => r.group);
  const order = [...groups.keys()].sort((a, b) => Number(a.includes("savings")) - Number(b.includes("savings")) || a.localeCompare(b));

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Bills" sub={`${rows.length} item${rows.length === 1 ? "" : "s"} · utilities have their own tab`} />
        <Link
          href="/bills/new"
          aria-label="Add item"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"
        >
          <Plus size={22} strokeWidth={2.4} />
        </Link>
      </div>

      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filter">
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

      {rows.length === 0 && <p className="px-1 text-sm text-muted">Nothing here.</p>}

      <div className="flex flex-col gap-4">
        {order.map((group) => (
          <section key={group} className="flex flex-col gap-1.5">
            <div className="px-1">
              <SectionLabel>{group}</SectionLabel>
            </div>
            <ul className="rounded-2xl border border-line bg-white px-4">
              {groups.get(group)!.map((r) => (
                <li key={r.id} className="border-t border-[#EEEFEA] first:border-t-0">
                  <Link href={`/bills/${r.id}`} className="flex gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{r.name}</p>
                      <p className={`mt-0.5 text-xs ${r.overdue ? "font-bold text-hike-ink" : "text-muted"}`}>
                        {r.vendor}
                        {r.next && ` · ${r.next}`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Pill tone={r.isSavings ? "purple" : r.type === "POLICY" ? "orange" : r.type === "CONTRACT" || r.type === "RECURRING" ? "teal" : "grey"}>
                          {r.isSavings ? "Savings" : TYPE_LABEL[r.type]}
                        </Pill>
                        {r.autoRenew && <Pill tone="teal">Auto-renew</Pill>}
                        {r.status === "ACTIVE" && (r.card ? <Pill>{r.card}</Pill> : <Pill tone="orange">No card set</Pill>)}
                      </div>
                      {r.riders.map((rd) => (
                        <p key={rd.id} className="mt-2 flex justify-between rounded-lg bg-[#F6F6F3] px-2.5 py-1.5 text-xs text-muted">
                          <span>↳ {rd.name}</span>
                          <span className="font-bold text-ink">{rd.amount}</span>
                        </p>
                      ))}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold">{r.amount}</p>
                      <p className="text-xs text-muted">{r.cycle}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
