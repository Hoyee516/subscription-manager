import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { addMonths, fmtDay, fmtMonth, todayHK } from "@/lib/dates";
import { money } from "@/lib/billing";
import PageHeader from "@/components/PageHeader";
import UtilityChart from "@/components/UtilityChart";
import ReminderEditor from "@/components/ReminderEditor";
import { Card, Pill, SectionLabel } from "@/components/ui";
import { utilityTarget } from "@/lib/remind";
import { calendarConfigured } from "@/lib/gcal";

const ym = (d: Date) => d.toISOString().slice(0, 7); // "2026-10"
const cycleText = (m: number) => (m === 1 ? "monthly" : m === 3 ? "quarterly" : `every ${m} months`);

export default async function UtilitiesPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const userId = await requireUserId();
  const { u } = await searchParams;
  const today = todayHK();
  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearAgo = addMonths(thisMonth, -12);

  const utilities = await prisma.utility.findMany({
    where: { userId, isActive: true },
    orderBy: { name: "asc" },
    include: {
      bills: { orderBy: { periodStart: "desc" }, include: { paymentMethod: { select: { label: true } } } },
    },
  });
  if (utilities.length === 0) {
    return <PageHeader title="Utilities" sub="No utilities yet" />;
  }
  const sel = utilities.find((x) => x.id === u) ?? utilities[0];
  // The calendar event "Remind me" creates (bills oldest-first, as the schedule expects).
  const remTarget = utilityTarget({ ...sel, bills: [...sel.bills].reverse() }, today);
  const calUser = await prisma.user.findUnique({ where: { id: userId }, select: { calendarId: true } });
  const calendarReady = calendarConfigured(calUser?.calendarId);

  // Average monthly cost over the last 12 months of bills.
  const tiles = utilities.map((x) => {
    const recent = x.bills.filter((b) => b.periodStart >= yearAgo && b.periodStart < addMonths(thisMonth, 1));
    const total = recent.reduce((s, b) => s + Number(b.amount), 0);
    return { id: x.id, name: x.name, perMonth: Math.round(total / 12), cycle: cycleText(x.cycleMonths) };
  });

  // Expected bills not recorded yet: from the latest bill forward, one per cycle, up to this month.
  const toRecord = utilities.flatMap((x) => {
    const latest = x.bills[0];
    if (!latest) return [];
    const out: { utilityId: string; name: string; month: Date; current: boolean }[] = [];
    for (let m = addMonths(latest.periodStart, x.cycleMonths); m <= thisMonth; m = addMonths(m, x.cycleMonths)) {
      out.push({ utilityId: x.id, name: x.name, month: m, current: m.getTime() === thisMonth.getTime() });
    }
    return out;
  });

  // Unpaid bills that have a due date.
  const unpaid = utilities.flatMap((x) =>
    x.bills.filter((b) => !b.paidAt && b.dueDate).map((b) => ({ name: x.name, b }))
  );

  const points = sel.bills.map((b) => ({
    id: b.id,
    month: ym(b.periodStart),
    amount: Number(b.amount),
    unpaid: !b.paidAt && !!b.dueDate,
  }));

  return (
    <>
      <PageHeader title="Utilities" sub="Variable bills · manual payment · year-on-year" />

      <div className="mb-3 grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <Link
            key={t.id}
            href={`/utilities?u=${t.id}`}
            aria-current={t.id === sel.id ? "page" : undefined}
            className={`flex flex-col gap-1 rounded-[14px] bg-white p-3 ${t.id === sel.id ? "border-2 border-info p-[11px]" : "border border-line"}`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.name}</span>
            <span className="text-[17px] font-extrabold">{money(t.perMonth)}</span>
            <span className="text-xs text-muted">/mo · {t.cycle}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {(toRecord.length > 0 || unpaid.length > 0) && (
          <Card className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <SectionLabel>To do</SectionLabel>
              <Pill tone="blue">{toRecord.length + unpaid.length}</Pill>
            </div>
            <ul>
              {unpaid.map(({ name, b }) => (
                <li key={b.id} className="border-t border-[#EEEFEA] first:border-t-0">
                  <Link href={`/utilities/bills/${b.id}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="block text-sm font-bold">
                        {name} · {fmtMonth(b.periodStart)} · {money(Number(b.amount))}
                      </span>
                      <span className={`text-xs ${b.dueDate! < today ? "font-bold text-hike-ink" : "text-muted"}`}>
                        {b.dueDate! < today ? "Overdue since" : "Due"} {fmtDay(b.dueDate)} · not paid
                      </span>
                    </span>
                    <span className="text-[13px] font-bold text-brand">Mark paid</span>
                  </Link>
                </li>
              ))}
              {toRecord.map((r) => (
                <li key={`${r.utilityId}-${r.month.toISOString()}`} className="border-t border-[#EEEFEA] first:border-t-0">
                  <Link
                    href={`/utilities/bills/new?u=${r.utilityId}&m=${ym(r.month)}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span>
                      <span className="block text-sm font-bold">
                        {r.name} · {fmtMonth(r.month)}
                      </span>
                      <span className="text-xs text-muted">{r.current ? "Bill expected this month" : "Bill not recorded yet"}</span>
                    </span>
                    <span className="text-[13px] font-bold text-brand">Enter</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <SectionLabel>{sel.name} bills</SectionLabel>
            <Link
              href={`/utilities/bills/new?u=${sel.id}`}
              aria-label={`Add ${sel.name} bill`}
              className="flex h-9 items-center gap-1 rounded-lg bg-brand px-3 text-[13px] font-bold text-white"
            >
              <Plus size={16} strokeWidth={2.4} /> Add
            </Link>
          </div>
          <UtilityChart key={sel.id} bills={points} thisYear={today.getUTCFullYear()} />
        </Card>

        <Card className="flex flex-col gap-3">
          <SectionLabel>{sel.name} reminders</SectionLabel>
          <ReminderEditor
            key={sel.id}
            target={{ utilityId: sel.id }}
            initialOn={sel.remind}
            next={remTarget ? { date: remTarget.date.toISOString().slice(0, 10), title: remTarget.title } : null}
            calendarReady={calendarReady}
            beforeWhat="bill due date"
          />
        </Card>
      </div>
    </>
  );
}
