import Link from "next/link";
import { Plus, TriangleAlert } from "lucide-react";
import { allMethods } from "@/lib/reads";
import { requireUserId } from "@/lib/session";
import { addDays, addMonths, todayHK } from "@/lib/dates";
import { cardExpiry, expText } from "@/lib/alerts";
import { money } from "@/lib/billing";
import { isLapsed, itemMonthly, loadData, methodOf } from "@/lib/schedule";
import PageHeader from "@/components/PageHeader";
import { Card, Pill } from "@/components/ui";

const TYPE_TEXT = { CARD: "Card", BANK: "Bank / FPS", OTHER: "Other" } as const;

export default async function CardsPage() {
  const userId = await requireUserId();
  const today = todayHK();
  const [data, methods] = await Promise.all([
    loadData(userId),
    allMethods(userId),
  ]);

  // Per method: active bills charged to it (riders follow their main bill) and their yearly cost.
  const live = data.items.filter((i) => !isLapsed(i, today));
  const yearAgo = addMonths(today, -12);
  const rows = methods.map((m) => {
    const items = live.filter((i) => methodOf(i)?.id === m.id);
    const billsYear = data.utilities.flatMap((u) =>
      u.bills.filter((b) => b.paidAt && b.paidAt >= yearAgo && b.paymentMethodId === m.id).map((b) => ({ u: u.name, amt: Number(b.amount) }))
    );
    const utilityNames = [...new Set(billsYear.map((b) => b.u))];
    const year = items.reduce((s, i) => s + itemMonthly(i, today) * 12, 0) + billsYear.reduce((s, b) => s + b.amt, 0);
    return { m, items, utilityNames, year };
  });
  const active = rows.filter((r) => r.m.isActive).sort((a, b) => b.year - a.year);
  const archived = rows.filter((r) => !r.m.isActive);
  const expiringSoon = (m: (typeof methods)[number]) => {
    const e = cardExpiry(m);
    return !!e && e <= addDays(today, 60);
  };
  const unassigned = live.filter((i) => !methodOf(i) && i.type !== "TRIAL");

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Payment methods" sub="What each card carries per year" />
        <Link href="/cards/new" aria-label="Add payment method" className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
          <Plus size={22} strokeWidth={2.4} />
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {unassigned.length > 0 && (
          <section className="flex items-start gap-3 rounded-2xl border border-[#F3D4BC] bg-[#FDF1E7] p-4">
            <TriangleAlert size={22} className="flex-none text-hike-ink" />
            <div>
              <p className="text-sm font-bold text-[#7C2D12]">
                {unassigned.length} active {unassigned.length === 1 ? "bill has" : "bills have"} no payment method
              </p>
              <p className="mt-0.5 text-xs text-[#7C2D12]">
                {unassigned.map((i, k) => (
                  <span key={i.id}>
                    {k > 0 && ", "}
                    <Link href={`/bills/${i.id}/edit`} className="font-bold underline">
                      {i.name}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          </section>
        )}

        {active.map(({ m, items, utilityNames, year }) => (
          <Card key={m.id} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <Link href={`/cards/${m.id}`} className="min-w-0">
                <span className="block text-sm font-bold">{m.label}</span>
                <span className="block text-xs text-muted">
                  {TYPE_TEXT[m.type]}
                  {m.issuer ? ` · ${m.issuer}` : ""}
                  {m.expiryMonth && m.expiryYear && !expiringSoon(m) ? ` · Exp ${expText(m)}` : ""} · edit
                </span>
                {expiringSoon(m) && (
                  <span className="mt-1 inline-block">
                    <Pill tone="blue">
                      {cardExpiry(m)! < today ? "Expired" : "Exp"} {expText(m)}
                    </Pill>
                  </span>
                )}
              </Link>
              {items.length || utilityNames.length ? (
                <span className="text-right">
                  <span className="block text-sm font-bold">{money(Math.round(year))}</span>
                  <span className="block text-xs text-muted">/ year</span>
                </span>
              ) : (
                <Pill>No active bills</Pill>
              )}
            </div>
            {(items.length > 0 || utilityNames.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {items.map((i) => (
                  <Link key={i.id} href={`/bills/${i.id}`} className="rounded-lg bg-ground px-2.5 py-1.5 text-xs font-semibold text-[#3C4650]">
                    {i.name}
                  </Link>
                ))}
                {utilityNames.map((n) => (
                  <span key={n} className="rounded-lg bg-[#DAE6F6] px-2.5 py-1.5 text-xs font-semibold text-info">
                    {n}
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}

        <p className="px-1 text-xs text-muted">
          Yearly figures: each bill&apos;s current price spread over a year (one-off passes and trials not counted), plus utility bills
          paid with the card in the last 12 months.
        </p>

        {archived.length > 0 && (
          <Card className="flex flex-col gap-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Archived</p>
            {archived.map(({ m }) => (
              <Link key={m.id} href={`/cards/${m.id}`} className="py-1.5 text-sm text-muted">
                {m.label}
              </Link>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
