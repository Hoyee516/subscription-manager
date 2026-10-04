import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { todayHK, fmtDay } from "@/lib/dates";
import { cycleLabel, money, nextDate, TYPE_LABEL, type CycleUnitName, type ItemTypeName, type LeadUnitName } from "@/lib/billing";
import { toHkd } from "@/lib/fx";
import { BackBar, Card, Pill, SectionLabel } from "@/components/ui";
import ReminderEditor from "@/components/ReminderEditor";
import ItemStatusActions from "@/components/ItemStatusActions";


export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: {
      parent: { select: { id: true, name: true } },
      paymentMethod: { select: { label: true } },
      riders: { orderBy: { name: "asc" }, include: { terms: { orderBy: { startDate: "asc" } } } },
      reminders: { orderBy: { createdAt: "asc" } },
      terms: {
        orderBy: { startDate: "asc" },
        include: { payments: { orderBy: { paidAt: "asc" }, include: { paymentMethod: { select: { label: true } } } } },
      },
    },
  });
  if (!item) notFound();

  const today = todayHK();
  const type = item.type as ItemTypeName;
  const latest = item.terms[item.terms.length - 1];
  // Most recent payment across all terms decides the "In person", "Bill payment" and "Combined bill" badges.
  const lastPayment = item.terms
    .flatMap((t) => t.payments)
    .reduce<(typeof item.terms)[number]["payments"][number] | null>((a, p) => (!a || p.paidAt >= a.paidAt ? p : a), null);
  const nd = nextDate(type, item.status === "ACTIVE", item.terms, today);

  const head = latest
    ? (() => {
        const amt = Number(latest.amount);
        const { hkd, approx } = toHkd(amt, latest.currency, latest.amountHkd ? Number(latest.amountHkd) : null);
        return latest.currency === "HKD" || hkd === null
          ? { main: money(amt, latest.currency), original: null }
          : { main: `${approx ? "≈" : ""}${money(hkd)}`, original: `(${money(amt, latest.currency)})` };
      })()
    : null;

  // Newest first, each with its change vs the previous term in the same currency and cycle.
  const terms = item.terms
    .map((t, i) => {
      const prev = item.terms[i - 1];
      const amt = Number(t.amount);
      const comparable = prev && prev.currency === t.currency && prev.cycleUnit === t.cycleUnit && prev.cycleCount === t.cycleCount && Number(prev.amount) > 0;
      const change = comparable ? (amt / Number(prev.amount) - 1) * 100 : null;
      const paid = Math.round(t.payments.reduce((s, p) => s + Number(p.amountHkd), 0) * 100) / 100;
      // Full amount in HKD, where known, to tell whether instalments are complete.
      const full = t.amountHkd ? Number(t.amountHkd) : t.currency === "HKD" ? amt : null;
      const fullyPaid = t.payments.length > 0 && (full === null || paid >= full - 0.01);
      const months =
        type === "CONTRACT" && t.endDate ? Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000 / 30.44) : null;
      // Riders (e.g. 治療保 on 危疾(租)) for the same policy year, matched by start date.
      const riders = item.riders.flatMap((r) => {
        const j = r.terms.findIndex((rt) => rt.startDate.getTime() === t.startDate.getTime());
        if (j < 0) return [];
        const rt = r.terms[j];
        const rp = r.terms[j - 1];
        const ramt = Number(rt.amount);
        const rchange = rp && rp.currency === rt.currency && Number(rp.amount) > 0 ? (ramt / Number(rp.amount) - 1) * 100 : null;
        return [{ id: r.id, name: r.name, amt: ramt, currency: rt.currency, hkd: rt.amountHkd ? Number(rt.amountHkd) : null, change: rchange }];
      });
      const sameCurrency = riders.every((r) => r.currency === t.currency);
      const total = riders.length > 0 && sameCurrency ? Math.round((amt + riders.reduce((x, r) => x + r.amt, 0)) * 100) / 100 : null;
      const totalHkd =
        riders.length > 0 && t.amountHkd && riders.every((r) => r.hkd !== null)
          ? Math.round((Number(t.amountHkd) + riders.reduce((x, r) => x + (r.hkd ?? 0), 0)) * 100) / 100
          : null;
      return { t, amt, change, paid, fullyPaid, months, riders, total, totalHkd };
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
        {latest && head && (
          <>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-[30px] font-extrabold">{head.main}</span>
              <span className="text-sm text-muted">{cycleLabel(latest.cycleUnit as CycleUnitName, latest.cycleCount)}</span>
            </p>
            {head.original && <p className="text-[13px] text-muted">{head.original}</p>}
          </>
        )}
        {nd && (
          <p className={`text-[13px] ${nd.past ? "font-bold text-hike-ink" : "text-muted"}`}>
            {nd.label} {fmtDay(nd.date)}
          </p>
        )}
        <p className="text-[13px] text-muted">
          Charged to{" "}
          {item.paymentMethod ? (
            <span className="font-bold text-ink">{item.paymentMethod.label}</span>
          ) : (
            <Link href={`/bills/${item.id}/edit`} className="font-bold text-hike-ink">
              not set — add card
            </Link>
          )}
          {lastPayment?.channel === "IN_PERSON" && (
            <>
              {" "}
              <Pill tone="yellow">In person</Pill>
            </>
          )}
          {lastPayment?.channel === "BILL_PAYMENT" && (
            <>
              {" "}
              <Pill tone="blue">Bill payment</Pill>
            </>
          )}
          {lastPayment?.batchId && (
            <>
              {" "}
              <Pill tone="pink">Combined bill</Pill>
            </>
          )}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Terms &amp; payments</SectionLabel>
            <Link href={`/bills/${item.id}/terms/new`} className="text-[13px] font-bold text-brand">
              + Start new term
            </Link>
          </div>
          <ul className="flex flex-col gap-2.5">
            {terms.map(({ t, amt, change, paid, fullyPaid, months, riders, total, totalHkd }) => (
              <li key={t.id} className="rounded-xl border border-[#D5D8D1] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {fmtDay(t.startDate)} – {t.endDate ? fmtDay(t.endDate) : "ongoing"}
                    </p>
                    {(months || t.amountHkd) && (
                      <p className="text-xs text-muted">
                        {[months ? `${months}-month contract` : "", t.amountHkd ? money(Number(t.amountHkd)) : ""].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {t.notes && <p className="mt-0.5 text-xs text-muted">{t.notes}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">{money(amt, t.currency)}</p>
                    {change !== null && <p className="text-xs font-bold"><Change pct={change} /></p>}
                  </div>
                </div>

                {riders.map((r) => (
                  <Link key={r.id} href={`/bills/${r.id}`} className="mt-1.5 flex items-start justify-between gap-3">
                    <span className="min-w-0 text-[13px]">
                      <span className="font-bold">+ {r.name}</span>
                      {r.hkd !== null && <span className="block text-xs text-muted">{money(r.hkd)}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-bold">{money(r.amt, r.currency)}</span>
                      {r.change !== null && (
                        <span className="block text-xs font-bold">
                          <Change pct={r.change} />
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
                {total !== null && (
                  <div className="mt-1.5 flex items-start justify-between gap-3 border-t border-line pt-1.5">
                    <span className="text-[13px] font-bold">
                      Year total
                      {totalHkd !== null && <span className="block text-xs font-normal text-muted">{money(totalHkd)}</span>}
                    </span>
                    <span className="text-[13px] font-extrabold">{money(total, t.currency)}</span>
                  </div>
                )}

                {t.payments.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-[#F6F6F3] px-2.5 py-2">
                    {t.payments.map((p) => (
                      <li key={p.id}>
                        <Link href={`/bills/${item.id}/payments/${p.id}`} className="text-xs font-bold text-ink">
                          💳 Paid {fmtDay(p.paidAt)}
                        </Link>
                        {p.paymentMethod && <span className="text-xs text-muted"> ({p.paymentMethod.label})</span>}
                        {p.channel === "IN_PERSON" && (
                          <>
                            {" "}
                            <Pill tone="yellow">In person</Pill>
                          </>
                        )}
                        {p.channel === "BILL_PAYMENT" && (
                          <>
                            {" "}
                            <Pill tone="blue">Bill payment</Pill>
                          </>
                        )}
                        {p.batchId && (
                          <>
                            {" "}
                            <Pill tone="pink">Combined bill</Pill>
                          </>
                        )}
                      </li>
                    ))}
                    {t.payments.length > 1 && <li className="border-t border-line pt-1 text-xs text-muted">Total paid {money(paid)}</li>}
                  </ul>
                )}

                <div className="mt-2 flex gap-4">
                  {!fullyPaid ? (
                    <Link href={`/bills/${item.id}/terms/${t.id}/pay`} className="text-[13px] font-bold text-brand">
                      {t.payments.length > 0 ? "Log next payment" : "Log payment"}
                    </Link>
                  ) : (
                    t.payments.length === 1 && (
                      <Link href={`/bills/${item.id}/payments/${t.payments[0].id}`} className="text-[13px] font-bold text-brand">
                        Edit payment
                      </Link>
                    )
                  )}
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
                <span>{r.terms.length ? money(Number(r.terms[r.terms.length - 1].amount), r.terms[r.terms.length - 1].currency) : "—"}</span>
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

        <ItemStatusActions itemId={item.id} status={item.status} />
      </div>
    </>
  );
}

/** ▲ red for increases, ▼ green for decreases, green "▬ 0%" when unchanged. */
function Change({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.05) return <span className="text-brand">▬ 0%</span>;
  return (
    <span className={pct > 0 ? "text-hike-ink" : "text-brand"}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
