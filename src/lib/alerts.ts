// Needs attention: the 11 alert kinds, worked out fresh from the data each time Home opens
// (so fixing the cause clears an alert at once). The Alert table only remembers what you
// dismissed, plus calendar-sync failures written by the sync.
import { prisma } from "./prisma";
import { addDays, addMonths, daysBetween, fmtDay, fmtMonth } from "./dates";
import { money } from "./billing";
import { nextCycleCharge } from "./due";
import { isLapsed, methodOf, occurrences, priceHikes, termHkd, type LoadedData } from "./schedule";
import type { PillTone } from "@/components/ui";

export type AlertKind =
  | "PRICE_HIKE"
  | "UTILITY_JUMP"
  | "TRIAL_ENDING"
  | "AUTO_RENEWAL"
  | "CONTRACT_ENDING"
  | "DUE_SOON"
  | "CARD_EXPIRING"
  | "NO_CARD"
  | "BILL_TO_RECORD"
  | "UTILITY_MISSING"
  | "SYNC_FAILED";

export type AlertView = {
  key: string; // dedupe key: a dismissed key never shows again
  type: AlertKind;
  title: string;
  sub: string;
  pill: string;
  tone: PillTone;
  href: string;
  date: Date; // for sorting within a kind
};

const ORDER: AlertKind[] = [
  "PRICE_HIKE",
  "UTILITY_JUMP",
  "CARD_EXPIRING",
  "TRIAL_ENDING",
  "AUTO_RENEWAL",
  "CONTRACT_ENDING",
  "DUE_SOON",
  "BILL_TO_RECORD",
  "NO_CARD",
  "UTILITY_MISSING",
  "SYNC_FAILED",
];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const r0 = (n: number) => Math.round(n);
const inDays = (d: Date, today: Date) => {
  const n = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
};

type Method = { id: string; label: string; isActive: boolean; expiryMonth: number | null; expiryYear: number | null };

/** Last day of the card's expiry month, or null if not set. */
export function cardExpiry(m: { expiryMonth: number | null; expiryYear: number | null }): Date | null {
  if (!m.expiryMonth || !m.expiryYear) return null;
  return new Date(Date.UTC(m.expiryYear, m.expiryMonth, 0));
}
export const expText = (m: { expiryMonth: number | null; expiryYear: number | null }) =>
  `${String(m.expiryMonth).padStart(2, "0")}/${String(m.expiryYear).slice(-2)}`;

/** Passes that are memberships (e.g. a cinema membership) are named as such in alerts. */
const isMembership = (i: { name: string; category: string; categoryGroup: string }) =>
  /member|會員|cinema|戲院|電影/i.test(`${i.name} ${i.category} ${i.categoryGroup}`);

export function computeAlerts(data: LoadedData, methods: Method[], today: Date): AlertView[] {
  const out: AlertView[] = [];
  const live = data.items.filter((i) => !isLapsed(i, today));

  // 1 · Price hike
  for (const h of priceHikes(data, today)) {
    out.push({
      key: `PRICE_HIKE:${h.id}:${h.termId}`,
      type: "PRICE_HIKE",
      title: `${h.name} up ${h.pct.toFixed(1)}%`,
      sub: `${money(h.from, h.currency)} → ${money(h.to, h.currency)}${h.perYear ? ` · +${money(r0(h.perYear))} a year` : ""}`,
      pill: "Price hike",
      tone: "orange",
      href: `/bills/${h.id}`,
      date: today,
    });
  }

  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  for (const u of data.utilities) {
    // 2 · Utility jump: latest bill ≥10% above the same month last year
    const b = u.bills[u.bills.length - 1];
    if (b && b.periodStart >= addMonths(thisMonth, -3)) {
      const prev = u.bills.find((x) => x.periodStart.getTime() === addMonths(b.periodStart, -12).getTime());
      if (prev && Number(prev.amount) > 0) {
        const pct = (Number(b.amount) / Number(prev.amount) - 1) * 100;
        if (pct >= 10)
          out.push({
            key: `UTILITY_JUMP:${b.id}`,
            type: "UTILITY_JUMP",
            title: `${u.name} ${MON[b.periodStart.getUTCMonth()]} bill +${pct.toFixed(1)}% vs last year`,
            sub: `${money(Number(b.amount))} vs ${money(Number(prev.amount))} in ${fmtMonth(prev.periodStart)}`,
            pill: "Price hike",
            tone: "orange",
            href: `/utilities/bills/${b.id}`,
            date: b.periodStart,
          });
      }
    }

    // 8 · Unpaid utility bills (entered with a due date, not paid yet)
    for (const x of u.bills)
      if (!x.paidAt && x.dueDate)
        out.push({
          key: `BILL_TO_RECORD:utility:${x.id}`,
          type: "BILL_TO_RECORD",
          title: `${u.name} · ${fmtMonth(x.periodStart)} bill ${x.dueDate < today ? "overdue" : "due"}`,
          sub: `${money(Number(x.amount))} · due ${fmtDay(x.dueDate)}`,
          pill: "Unpaid",
          tone: "blue",
          href: `/utilities/bills/${x.id}`,
          date: x.dueDate,
        });

    // 9 · Utility bill missing
    const latest = u.bills[u.bills.length - 1];
    if (latest)
      for (let m = addMonths(latest.periodStart, u.cycleMonths); m <= thisMonth; m = addMonths(m, u.cycleMonths))
        out.push({
          key: `UTILITY_MISSING:${u.id}:${m.toISOString().slice(0, 7)}`,
          type: "UTILITY_MISSING",
          title: `${u.name} · ${fmtMonth(m)} bill not recorded`,
          sub: `Last bill: ${fmtMonth(latest.periodStart)}`,
          pill: "To record",
          tone: "blue",
          href: `/utilities/bills/new?u=${u.id}&m=${m.toISOString().slice(0, 7)}`,
          date: m,
        });
  }

  for (const i of live) {
    const last = i.terms[i.terms.length - 1];
    const end = last?.endDate;
    const price = last ? termHkd(last) : null;

    // 3 · Trial ending within 3 days
    if (i.type === "TRIAL" && end && end >= today && end <= addDays(today, 3))
      out.push({
        key: `TRIAL_ENDING:${i.id}:${ymd(end)}`,
        type: "TRIAL_ENDING",
        title: `${i.name} converts ${inDays(end, today)}`,
        sub: `${fmtDay(end)}${price ? ` · then ${money(price)}` : ""} · cancel before then if not wanted`,
        pill: "Trial ending",
        tone: "yellow",
        href: `/bills/${i.id}`,
        date: end,
      });

    // 4 / 5 · Renewal decision, 30 and 7 days ahead: a term ending (contract, policy, prepaid plan,
    // pass or membership), or a subscription billed yearly or longer renewing. Monthly subscriptions
    // get no decision alert (it would come every month); their charges show under Due soon.
    const yearly = last && (last.cycleUnit === "YEAR" || (last.cycleUnit === "MONTH" && last.cycleCount >= 12));
    const decision: { at: Date; renewsOn: Date; auto: boolean } | null =
      ["CONTRACT", "POLICY", "PREPAID", "PASS"].includes(i.type) && end
        ? { at: end, renewsOn: addDays(end, 1), auto: i.autoRenew }
        : i.type === "RECURRING" && yearly && !end
          ? (() => {
              const d = nextCycleCharge(last, today);
              return d ? { at: d, renewsOn: d, auto: true } : null;
            })()
          : null;
    if (decision && decision.at >= today && decision.at <= addDays(today, 30)) {
      const what =
        i.type === "POLICY"
          ? "Policy"
          : i.type === "PREPAID"
            ? "Plan"
            : i.type === "PASS"
              ? isMembership(i)
                ? "Membership"
                : "Pass"
              : i.type === "RECURRING"
                ? "Subscription"
                : "Contract";
      // The 7-day reminder has its own key, so dismissing the 30-day one doesn't hide it.
      const stage = decision.at <= addDays(today, 7) ? ":7" : "";
      const when = inDays(decision.renewsOn, today);
      out.push(
        decision.auto
          ? {
              key: `AUTO_RENEWAL:${i.id}:${ymd(decision.at)}${stage}`,
              type: "AUTO_RENEWAL",
              title: `${i.name} renews ${fmtDay(decision.renewsOn)}`,
              sub: `${when[0].toUpperCase()}${when.slice(1)}${price ? ` · about ${money(r0(price))}` : ""} · cancel before then if not required`,
              pill: "Auto-renewal",
              tone: "pink",
              href: `/bills/${i.id}`,
              date: decision.at,
            }
          : {
              key: `CONTRACT_ENDING:${i.id}:${ymd(decision.at)}${stage}`,
              type: "CONTRACT_ENDING",
              title: `${i.name} ends ${fmtDay(decision.at)}`,
              sub: `${what} doesn't auto-renew · renew or let it end`,
              pill: `${what} ending`,
              tone: "purple",
              href: `/bills/${i.id}`,
              date: decision.at,
            }
      );
    }

    // 7 · No card set (or card archived). Trials are skipped, as on the Cards page.
    const pm = methodOf(i);
    if (i.type !== "TRIAL" && (!pm || !pm.isActive))
      out.push({
        key: `NO_CARD:${i.id}${pm ? `:${pm.id}` : ""}`,
        type: "NO_CARD",
        title: pm ? `${i.name} is on an archived card` : `${i.name} has no payment method`,
        sub: pm ? `${pm.label} is archived · pick the card it's charged to` : "Set the card or account it's charged to",
        pill: "No card",
        tone: "blue",
        href: `/bills/${i.parentId ?? i.id}/edit`,
        date: today,
      });
  }

  // 10 · Due soon: charges you pay yourself 3 days and 1 day ahead; auto-pay charges 1 day ahead,
  // as a heads-up that the card will be charged. Each stage has its own key, so dismissing the
  // 3-day one doesn't hide the 1-day one. Utility bills have their own Unpaid alert.
  for (const o of occurrences(data, today, addDays(today, 3), today)) {
    if (o.kind !== "charge" || o.paid || o.key.startsWith("u-")) continue;
    const days = daysBetween(today, o.date);
    if (days > (o.autoCharge ? 1 : 3)) continue;
    const when = inDays(o.date, today);
    const amount = o.amount != null ? `${o.estimate ? "≈" : ""}${money(o.estimate ? r0(o.amount) : o.amount)} · ` : "";
    out.push({
      key: `DUE_SOON:${o.key}:${days <= 1 ? 1 : 3}`,
      type: "DUE_SOON",
      title: o.autoCharge ? `${o.name} · charged ${fmtDay(o.date)}` : `${o.name} · due ${fmtDay(o.date)}`,
      sub: `${when[0].toUpperCase()}${when.slice(1)} · ${amount}${o.autoCharge && !o.estimate ? `charged to ${o.sub}` : o.sub}`,
      pill: o.autoCharge ? "Auto-pay" : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`,
      tone: o.autoCharge ? "blue" : "yellow",
      href: o.href,
      date: o.date,
    });
  }

  // 8 · Not logged: a charge 3+ days past due with no payment (last 90 days, auto-charged bills excluded)
  for (const o of occurrences(data, addDays(today, -90), addDays(today, -3), today)) {
    if (o.kind !== "charge" || o.paid || o.estimate || o.autoCharge || o.key.startsWith("u-")) continue;
    out.push({
      key: `BILL_TO_RECORD:${o.key}`,
      type: "BILL_TO_RECORD",
      title: `${o.name} · due ${fmtDay(o.date)}`,
      sub: `${o.amount != null ? `${money(o.amount)} · ` : ""}no payment logged yet`,
      pill: "Not logged",
      tone: "grey",
      href: o.href,
      date: o.date,
    });
  }

  // 6 · Card expiring within 60 days (or expired) while active bills still use it
  for (const m of methods) {
    const e = cardExpiry(m);
    if (!m.isActive || !e || e > addDays(today, 60)) continue;
    const bills = live.filter((i) => methodOf(i)?.id === m.id).map((i) => i.name);
    if (!bills.length) continue;
    out.push({
      key: `CARD_EXPIRING:${m.id}:${m.expiryYear}-${m.expiryMonth}`,
      type: "CARD_EXPIRING",
      title: `${m.label} ${e < today ? "expired" : "expires"} ${expText(m)}`,
      sub: `${bills.length} ${bills.length === 1 ? "bill uses" : "bills use"} it: ${bills.slice(0, 4).join(", ")}${bills.length > 4 ? "…" : ""}`,
      pill: "Card expiring",
      tone: "blue",
      href: `/cards/${m.id}`,
      date: e,
    });
  }

  return sortAlerts(out);
}

export function sortAlerts<T extends { type: AlertKind; date: Date }>(a: T[]): T[] {
  return a.sort((x, y) => ORDER.indexOf(x.type) - ORDER.indexOf(y.type) || x.date.getTime() - y.date.getTime());
}

/** Live alerts minus dismissed ones, plus calendar-sync failures; and the dismissed list. */
export async function loadAlerts(userId: string, data: LoadedData, today: Date) {
  const [methods, rows] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: { userId },
      select: { id: true, label: true, isActive: true, expiryMonth: true, expiryYear: true },
    }),
    prisma.alert.findMany({ where: { userId }, orderBy: { dismissedAt: "desc" } }),
  ]);
  const dismissed = new Set(rows.filter((r) => r.dismissedAt).map((r) => r.dedupeKey));
  const sync: AlertView[] = rows
    .filter((r) => r.type === "SYNC_FAILED" && !r.dismissedAt)
    .map((r) => ({
      key: r.dedupeKey,
      type: "SYNC_FAILED",
      title: r.message,
      sub: r.detail ?? "",
      pill: "Calendar",
      tone: "teal",
      href: r.href ?? "/",
      date: r.dueAt,
    }));
  const active = [...computeAlerts(data, methods, today).filter((a) => !dismissed.has(a.key)), ...sync];
  const past = rows
    .filter((r) => r.dismissedAt)
    .slice(0, 20)
    .map((r) => ({ key: r.dedupeKey, title: r.message, sub: `Dismissed ${fmtDay(r.dismissedAt!)}`, pill: PILL_OF[r.type as AlertKind] ?? "Alert", href: r.href ?? "/" }));
  return { active, dismissed: past };
}

const PILL_OF: Partial<Record<AlertKind, string>> = {
  PRICE_HIKE: "Price hike",
  UTILITY_JUMP: "Price hike",
  TRIAL_ENDING: "Trial ending",
  AUTO_RENEWAL: "Auto-renewal",
  CONTRACT_ENDING: "Ending",
  DUE_SOON: "Due soon",
  CARD_EXPIRING: "Card expiring",
  NO_CARD: "No card",
  BILL_TO_RECORD: "Not logged",
  UTILITY_MISSING: "To record",
  SYNC_FAILED: "Calendar",
};
