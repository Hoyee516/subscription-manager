import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { addDays, addMonths, fmtDay, fmtMonth, todayHK } from "@/lib/dates";
import { money } from "@/lib/billing";
import { CATEGORY, isLapsed, itemMonthly, loadData, occurrences, priceHikes, summary, type Category } from "@/lib/schedule";
import PageHeader from "@/components/PageHeader";
import { Card, Pill, SectionLabel } from "@/components/ui";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r0 = (n: number) => Math.round(n);

export default async function HomePage() {
  const userId = await requireUserId();
  const today = todayHK();
  const data = await loadData(userId);
  const s = summary(data, today);

  // Needs attention: price hikes, utility bills up ≥10% year on year, bills to enter, unpaid utility bills.
  const attention: { key: string; tone: "orange" | "blue"; title: string; sub: string; pill: string; href: string }[] = [];
  for (const h of priceHikes(data, today)) {
    attention.push({
      key: `h-${h.id}`,
      tone: "orange",
      title: `${h.name} up ${h.pct.toFixed(1)}%`,
      sub: `${money(h.from, h.currency)} → ${money(h.to, h.currency)}${h.perYear ? ` · +${money(r0(h.perYear))} a year` : ""}`,
      pill: "Price hike",
      href: `/bills/${h.id}`,
    });
  }
  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  for (const u of data.utilities) {
    const b = u.bills[u.bills.length - 1];
    if (!b || b.periodStart < addMonths(thisMonth, -3)) continue;
    const prev = u.bills.find((x) => x.periodStart.getTime() === addMonths(b.periodStart, -12).getTime());
    if (prev && Number(prev.amount) > 0) {
      const pct = (Number(b.amount) / Number(prev.amount) - 1) * 100;
      if (pct >= 10)
        attention.push({
          key: `y-${b.id}`,
          tone: "orange",
          title: `${u.name} ${MON[b.periodStart.getUTCMonth()]} bill +${pct.toFixed(1)}% vs last year`,
          sub: `${money(Number(b.amount))} vs ${money(Number(prev.amount))} in ${fmtMonth(prev.periodStart)}`,
          pill: "Price hike",
          href: `/utilities/bills/${b.id}`,
        });
    }
  }
  for (const u of data.utilities) {
    for (const b of u.bills)
      if (!b.paidAt && b.dueDate)
        attention.push({
          key: `p-${b.id}`,
          tone: "blue",
          title: `${u.name} · ${fmtMonth(b.periodStart)} bill ${b.dueDate < today ? "overdue" : "due"}`,
          sub: `${money(Number(b.amount))} · due ${fmtDay(b.dueDate)}`,
          pill: "Unpaid",
          href: `/utilities/bills/${b.id}`,
        });
    const latest = u.bills[u.bills.length - 1];
    if (!latest) continue;
    for (let m = addMonths(latest.periodStart, u.cycleMonths); m <= thisMonth; m = addMonths(m, u.cycleMonths))
      attention.push({
        key: `r-${u.id}-${m.toISOString()}`,
        tone: "blue",
        title: `${u.name} · ${fmtMonth(m)} bill not recorded`,
        sub: `Last bill: ${fmtMonth(latest.periodStart)}`,
        pill: "To record",
        href: `/utilities/bills/new?u=${u.id}&m=${m.toISOString().slice(0, 7)}`,
      });
  }

  const soon = occurrences(data, today, addDays(today, 30), today).filter((o) => o.kind === "charge" && !o.paid);
  const big = occurrences(data, addDays(today, 31), addDays(today, 120), today)
    .filter((o) => o.kind === "charge" && (o.amount ?? 0) >= 5000)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];

  // Savings-type premiums (儲蓄, 年金): their own bar, one segment per policy, biggest first.
  const savings = data.items
    .filter((i) => i.isSavings && !isLapsed(i, today))
    .map((i) => ({ id: i.id, name: i.name, monthly: itemMonthly(i, today) }))
    .filter((x) => x.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  const savingsTotal = savings.reduce((t, x) => t + x.monthly, 0);

  // Biggest share first, in both the bar and its legend.
  const segs = (["insurance", "home", "tax", "subs", "utility", "savings"] as Category[]).filter((c) => s.by[c] > 0).sort((a, b) => s.by[b] - s.by[a]);

  return (
    <>
      <PageHeader title="Overview" sub={`${WEEKDAY[today.getUTCDay()]}, ${fmtDay(today)} · all figures in HKD`} />
      <div className="flex flex-col gap-3">
        <section className="flex flex-col gap-3.5 rounded-2xl bg-brand p-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#B5DDD4]">Monthly recurring cost</p>
          <p className="flex items-baseline gap-1.5">
            <span className="text-[38px] font-extrabold tracking-tight">{money(r0(s.mrc))}</span>
            <span className="text-sm text-[#B5DDD4]">/ month</span>
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-md">
              {segs.map((c) => (
                <div key={c} style={{ width: `${(s.by[c] / s.mrc) * 100}%`, background: SEG[c] }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#DCEFEA]">
              {segs.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ background: SEG[c] }} />
                  {CATEGORY[c].label} {r0(s.by[c]).toLocaleString("en-US")}
                </span>
              ))}
            </div>
          </div>

          {savings.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-[#2A7A6C] pt-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#B5DDD4]">Savings-type premiums</p>
                <p className="text-right">
                  <span className="text-lg font-extrabold">{money(r0(savingsTotal))}</span>
                  <span className="text-xs text-[#B5DDD4]"> / month</span>
                </p>
              </div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-md">
                {savings.map((x, k) => (
                  <div key={x.id} style={{ width: `${(x.monthly / savingsTotal) * 100}%`, background: SAV[k % SAV.length] }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#DCEFEA]">
                {savings.map((x, k) => (
                  <span key={x.id} className="flex items-center gap-1.5">
                    <i className="h-2.5 w-2.5 rounded-sm" style={{ background: SAV[k % SAV.length] }} />
                    {x.name} {r0(x.monthly).toLocaleString("en-US")}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#B5DDD4]">
                {money(r0(savingsTotal * 12))} a year
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-[#14705F] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#B5DDD4]">Annual burn</p>
              <p className="mt-1 text-lg font-extrabold">{money(r0(s.annual))}</p>
            </div>
            <div className="rounded-xl bg-[#14705F] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#B5DDD4]">Items active</p>
              <p className="mt-1 text-lg font-extrabold">{s.active}</p>
            </div>
          </div>
        </section>

        <Card className="flex flex-col gap-1">
          <SectionLabel>Needs attention</SectionLabel>
          {attention.length === 0 ? (
            <p className="py-2 text-sm text-muted">Nothing needs attention.</p>
          ) : (
            <ul>
              {attention.map((a) => (
                <li key={a.key} className="border-t border-[#EEEFEA] first:border-t-0">
                  <Link href={a.href} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${a.tone === "orange" ? "bg-hike" : "bg-info"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{a.title}</span>
                      <span className="block text-xs text-muted">{a.sub}</span>
                    </span>
                    <Pill tone={a.tone}>{a.pill}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <SectionLabel>Next 30 days</SectionLabel>
            <Link href="/calendar" className="text-[13px] font-bold text-brand">
              Calendar
            </Link>
          </div>
          {soon.length === 0 ? (
            <p className="py-2 text-sm text-muted">No charges in the next 30 days.</p>
          ) : (
            <ul>
              {soon.map((o) => (
                <li key={o.key} className="border-t border-[#EEEFEA] first:border-t-0">
                  <Link href={o.href} className="flex items-start gap-3 py-2.5">
                    <span className="w-11 flex-none text-center">
                      <span className="block text-sm font-bold">{o.date.getUTCDate()}</span>
                      <span className="block text-xs text-muted">{MON[o.date.getUTCMonth()]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{o.name}</span>
                      <span className="block text-xs text-muted">{o.sub}</span>
                    </span>
                    <span className="text-sm font-bold">
                      {o.amount != null ? `${o.estimate ? "≈" : ""}${money(r0(o.amount))}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {big && (
            <Link href={big.href} className="mt-1 flex items-center justify-between gap-2.5 rounded-xl bg-[#F6F1EA] px-3 py-2.5">
              <span>
                <span className="block text-[13px] font-bold">Next big payment</span>
                <span className="block text-xs text-muted">
                  {big.name} · {fmtDay(big.date)}
                </span>
              </span>
              <span className="text-sm font-bold">
                {big.estimate ? "≈" : ""}
                {money(r0(big.amount!))}
              </span>
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}

// One distinct hue per category, light enough to read on the brand-teal card
// (checked: every pair stays apart for normal vision; the legend names each one).
const SEG: Record<Category, string> = {
  insurance: "#FF8A65",
  home: "#FFE066",
  tax: "#F2F2F2",
  subs: "#5EE0B5",
  utility: "#8AB4FF",
  savings: "#F48FD8",
};

// Savings-type segments: distinct from the spending colours above.
const SAV = ["#CDBFF0", "#F6B9D4", "#F0E2A8"];
