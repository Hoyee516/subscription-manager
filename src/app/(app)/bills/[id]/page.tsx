import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { todayHK, fmtDay } from "@/lib/dates";
import { cycleLabel, money, nextDate, TYPE_LABEL, type CycleUnitName, type ItemTypeName, type LeadUnitName } from "@/lib/billing";
import { BackBar, Card, Pill, SectionLabel, btnPrimary } from "@/components/ui";
import ReminderEditor from "@/components/ReminderEditor";
import ItemStatusActions from "@/components/ItemStatusActions";

const CHANNEL_LABEL: Record<string, string> = {
  CARD_ONLINE: "card online",
  IN_PERSON: "in person",
  FPS: "FPS",
  AUTOPAY: "autopay",
  OTHER: "other",
};

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: {
      parent: { select: { id: true, name: true } },
      riders: { include: { terms: { orderBy: { startDate: "desc" }, take: 1 } } },
      reminders: { orderBy: { createdAt: "asc" } },
      terms: {
        orderBy: { startDate: "asc" },
        include: {
          paymentMethod: { select: { label: true } },
          payments: { orderBy: { paidAt: "asc" }, include: { paymentMethod: { select: { label: true } } } },
        },
      },
    },
  });
  if (!item) notFound();

  const today = todayHK();
  const type = item.type as ItemTypeName;
  const latest = item.terms[item.terms.length - 1];
  const nd = nextDate(type, item.status === "ACTIVE", item.terms, today);

  // Newest first, each with its change vs the previous term in the same currency and cycle.
  const terms = item.terms
    .map((t, i) => {
      const prev = item.terms[i - 1];
      const amt = Number(t.amount);
      const comparable = prev && prev.currency === t.currency && prev.cycleUnit === t.cycleUnit && prev.cycleCount === t.cycleCount && Number(prev.amount) > 0;
      const change = comparable ? (amt / Number(prev.amount) - 1) * 100 : null;
      const paid = t.payments.reduce((s, p) => s + Number(p.amountHkd), 0);
      return { t, amt, change, paid };
    })
    .reverse();

  return (
    <>
      <BackBar
        href={item.parent ? `/bills/${item.parent.id}` : "/bills"}
        label="Back"
        right={
          <Link href={`/bills/${item.id}/edit`} aria-label="Edit item" className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white">
            <Pencil size={18} />
          </Link>
        }
      />

      <header className="mb-4 px-1">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Pill tone={item.isSavings ? "purple" : "orange"}>{item.isSavings ? "Savings" : TYPE_LABEL[type]}</Pill>
          <Pill>
            {item.categoryGroup} › {item.category}
          </Pill>
          {item.autoRenew && <Pill tone="teal">Auto-renew</Pill>}
          {item.status !== "ACTIVE" && <Pill tone="blue">{item.status === "ENDED" ? "Ended" : "Cancelled"}</Pill>}
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight">{item.name}</h1>
        <p className="text-[13px] text-muted">
          {item.vendor}
          {item.parent && (
            <>
              {" · rider on "}
              <Link href={`/bills/${item.parent.id}`} className="font-bold text-brand">
                {item.parent.name}
              </Link>
            </>
          )}
        </p>
        {latest && (
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[30px] font-extrabold">{money(Number(latest.amount), latest.currency)}</span>
            <span className="text-sm text-muted">{cycleLabel(latest.cycleUnit as CycleUnitName, latest.cycleCount)}</span>
          </p>
        )}
        {nd && (
          <p className={`text-[13px] ${nd.past ? "font-bold text-hike-ink" : "text-muted"}`}>
            {nd.label} {fmtDay(nd.date)}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Terms &amp; payments</SectionLabel>
            <Link href={`/bills/${item.id}/terms/new`} className="text-[13px] font-bold text-brand">
              + Start new term
            </Link>
          </div>
          <ul>
            {terms.map(({ t, amt, change, paid }) => (
              <li key={t.id} className="border-t border-[#EEEFEA] py-3 first:border-t-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {fmtDay(t.startDate)} – {t.endDate ? fmtDay(t.endDate) : "ongoing"}
                    </p>
                    <p className="text-xs text-muted">
                      {t.paymentMethod?.label ?? "No card set"}
                      {t.commitmentMonths ? ` · ${t.commitmentMonths}-month contract` : ""}
                      {t.amountHkd ? ` · ≈${money(Number(t.amountHkd))}` : ""}
                    </p>
                    {t.notes && <p className="mt-0.5 text-xs text-muted">{t.notes}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">{money(amt, t.currency)}</p>
                    {change !== null && Math.abs(change) >= 0.05 && (
                      <p className={`text-xs font-bold ${change > 0 ? "text-hike-ink" : "text-brand"}`}>
                        {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>

                {t.payments.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-[#F6F6F3] px-2.5 py-2">
                    {t.payments.map((p) => (
                      <li key={p.id}>
                        <Link href={`/bills/${item.id}/payments/${p.id}`} className="flex justify-between gap-2 text-xs">
                          <span className="text-muted">
                            Paid {fmtDay(p.paidAt)}
                            {p.paymentMethod ? ` · ${p.paymentMethod.label}` : ""}
                            {p.channel ? ` · ${CHANNEL_LABEL[p.channel]}` : ""}
                          </span>
                          <span className="font-bold">{money(Number(p.amountHkd))}</span>
                        </Link>
                      </li>
                    ))}
                    {t.payments.length > 1 && (
                      <li className="flex justify-between border-t border-line pt-1 text-xs">
                        <span className="text-muted">Total paid</span>
                        <span className="font-bold">{money(Math.round(paid * 100) / 100)}</span>
                      </li>
                    )}
                  </ul>
                )}

                <div className="mt-2 flex gap-4">
                  <Link href={`/bills/${item.id}/terms/${t.id}/pay`} className="text-[13px] font-bold text-brand">
                    Log payment
                  </Link>
                  <Link href={`/bills/${item.id}/terms/${t.id}`} className="text-[13px] font-bold text-muted">
                    Edit term
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {item.riders.length > 0 && (
          <Card className="flex flex-col gap-2">
            <SectionLabel>Riders &amp; add-ons</SectionLabel>
            {item.riders.map((r) => (
              <Link key={r.id} href={`/bills/${r.id}`} className="flex justify-between text-sm">
                <span className="font-bold">{r.name}</span>
                <span>{r.terms[0] ? money(Number(r.terms[0].amount), r.terms[0].currency) : "—"}</span>
              </Link>
            ))}
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <SectionLabel>Reminders</SectionLabel>
          <ReminderEditor
            target={{ itemId: item.id }}
            allowHours={type === "TRIAL"}
            initial={item.reminders.map((r) => ({ offset: r.offset, unit: r.unit as LeadUnitName }))}
            beforeWhat={type === "CONTRACT" ? "contract end" : type === "PASS" || type === "TRIAL" || type === "PREPAID" ? "end date" : "due date"}
          />
        </Card>

        {(item.notes || item.cancelUrl) && (
          <Card className="flex flex-col gap-1.5">
            <SectionLabel>Notes</SectionLabel>
            {item.notes && <p className="whitespace-pre-line text-sm">{item.notes}</p>}
            {item.cancelUrl && (
              <a href={item.cancelUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand">
                Cancellation page ↗
              </a>
            )}
          </Card>
        )}

        <Link href={`/bills/${item.id}/terms/new`} className={btnPrimary}>
          Start new term
        </Link>
        <ItemStatusActions itemId={item.id} status={item.status} />
      </div>
    </>
  );
}
