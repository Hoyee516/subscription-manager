// "Remind me" → one Google Calendar event per bill or utility, on its next date, at 10:00 HKT.
// Notifications come from the calendar's default notifications in Google Calendar settings.
import { after } from "next/server";
import { prisma } from "./prisma";
import { addDays } from "./dates";
import { money } from "./billing";
import { isLapsed, loadData, occurrences, termHkd, type LoadedData, type LoadedItem, type LoadedUtility } from "./schedule";
import { calendarConfigured, defaultCalendarId, deleteEvent, upsertEvent, type CalEvent } from "./gcal";

export type RemTarget = { date: Date; title: string; what: string; href: string };

const amt = (n: number, estimate = false) => `${estimate ? "≈" : ""}${money(estimate ? Math.round(n) : Math.round(n * 100) / 100)}`;

/** What a bill's event is about: its end date (trials, passes, contracts, prepaid) or its next charge. */
export function itemTarget(i: LoadedItem, data: LoadedData, today: Date): RemTarget | null {
  if (i.status !== "ACTIVE" || isLapsed(i, today)) return null;
  const href = `/bills/${i.id}`;
  const last = i.terms[i.terms.length - 1];
  const price = last ? termHkd(last) : null;
  const priced = price ? ` · ${amt(price)}` : "";

  if (["TRIAL", "PASS", "PREPAID", "CONTRACT"].includes(i.type)) {
    if (!last?.endDate || last.endDate < today) return null;
    const what =
      i.type === "TRIAL" ? "trial ends" : i.type === "PASS" ? "pass ends" : i.type === "CONTRACT" ? "contract ends" : i.autoRenew ? "renews" : "ends";
    const then = i.type === "TRIAL" && price ? ` · then ${amt(price)}` : i.type === "PASS" ? "" : priced;
    return { date: last.endDate, title: `💳 ${i.name} · ${what}${then}`, what, href };
  }

  // Next charge not yet logged; a charge on or after today stays until its day has passed
  // (so auto-charged bills keep their due-day reminder).
  const one = { items: [i], utilities: [] as LoadedData["utilities"] };
  const next = occurrences(one, today, addDays(today, 400), today).find((o) => o.kind === "charge" && !o.logged);
  if (!next || next.amount == null) return null;
  return { date: next.date, title: `💳 ${i.name} · ${amt(next.amount, next.estimate)}`, what: "due", href };
}

export function utilityTarget(u: LoadedUtility, today: Date): RemTarget | null {
  const one = { items: [] as LoadedData["items"], utilities: [u] };
  const next = occurrences(one, today, addDays(today, 400), today).find((o) => !o.paid);
  if (!next || next.amount == null) return null;
  return { date: next.date, title: `💳 ${u.name} · ${amt(next.amount, next.estimate)}`, what: next.estimate ? "bill expected" : "due", href: next.href };
}

function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return u.replace(/\/$/, "");
}

function hashOf(calendarId: string, ev: CalEvent) {
  return JSON.stringify([calendarId, ev.date.toISOString().slice(0, 10), ev.title, ev.description, "default-notifications"]);
}

async function recordFailure(userId: string, key: string, name: string, href: string, err: unknown, ref: { itemId?: string; utilityId?: string }) {
  const detail = (err instanceof Error ? err.message : String(err)).slice(0, 200);
  await prisma.alert.upsert({
    where: { dedupeKey: key },
    create: { userId, type: "SYNC_FAILED", dedupeKey: key, message: `${name}: couldn't sync to Google Calendar`, detail, href, dueAt: new Date(), ...ref },
    update: { detail, dueAt: new Date() },
  });
}

/**
 * Brings Google Calendar in line with the app for one user (or one bill / utility):
 * creates, moves or deletes events. Unchanged events aren't re-sent.
 */
export async function syncCalendar(userId: string, only?: { itemId: string } | { utilityId: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarId: true } });
  const calendarId = user?.calendarId || defaultCalendarId();
  if (!calendarId || !calendarConfigured(calendarId)) return { synced: 0, failed: 0, skipped: true };

  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date())}T00:00:00Z`);
  const wantItems = !only || "itemId" in only;
  const wantUtils = !only || "utilityId" in only;
  const [data, items, utilities] = await Promise.all([
    loadData(userId, only),
    wantItems
      ? prisma.item.findMany({
          where: { userId, ...(only && "itemId" in only ? { id: only.itemId } : {}), OR: [{ remind: true }, { calEventId: { not: null } }] },
          select: { id: true, name: true, remind: true, calEventId: true, calEventHash: true },
        })
      : [],
    wantUtils
      ? prisma.utility.findMany({
          where: { userId, ...(only && "utilityId" in only ? { id: only.utilityId } : {}), OR: [{ remind: true }, { calEventId: { not: null } }] },
          select: { id: true, name: true, remind: true, calEventId: true, calEventHash: true },
        })
      : [],
  ]);

  let synced = 0;
  let failed = 0;
  const base = appUrl();

  const handle = async (
    row: (typeof items)[number],
    target: RemTarget | null,
    save: (d: { calEventId: string | null; calEventHash: string | null }) => Promise<unknown>,
    ref: { itemId?: string; utilityId?: string },
    keyPart: string
  ) => {
    const failKey = `SYNC_FAILED:${keyPart}`;
    try {
      if (!row.remind || !target) {
        if (row.calEventId) {
          await deleteEvent(calendarId, row.calEventId);
          await save({ calEventId: null, calEventHash: null });
          synced++;
        }
      } else {
        const ev: CalEvent = {
          date: target.date,
          title: target.title,
          description: `${row.name} · ${target.what}${base ? `\n${base}${target.href}` : ""}`,
        };
        const hash = hashOf(calendarId, ev);
        if (row.calEventId && row.calEventHash === hash) return;
        const id = await upsertEvent(calendarId, row.calEventId, ev);
        await save({ calEventId: id, calEventHash: hash });
        synced++;
      }
      await prisma.alert.deleteMany({ where: { dedupeKey: failKey } });
    } catch (e) {
      failed++;
      console.error(`[calendar] ${row.name}:`, e);
      await recordFailure(userId, failKey, row.name, target?.href ?? (ref.itemId ? `/bills/${ref.itemId}` : "/utilities"), e, ref).catch(() => {});
    }
  };

  for (const row of items) {
    const i = data.items.find((x) => x.id === row.id);
    await handle(row, i ? itemTarget(i, data, today) : null, (d) => prisma.item.update({ where: { id: row.id }, data: d }), { itemId: row.id }, `item:${row.id}`);
  }
  for (const row of utilities) {
    const u = data.utilities.find((x) => x.id === row.id);
    await handle(row, u ? utilityTarget(u, today) : null, (d) => prisma.utility.update({ where: { id: row.id }, data: d }), { utilityId: row.id }, `utility:${row.id}`);
  }
  return { synced, failed, skipped: false };
}

/** Runs the sync after the response is sent, so saving stays fast. */
export function syncLater(userId: string, only?: { itemId: string } | { utilityId: string }) {
  after(() => syncCalendar(userId, only).catch((e) => console.error("[calendar] sync failed", e)));
}

/** Before deleting bills: remove their events (the rows that remember the event ids are about to go). */
export async function deleteItemEvents(userId: string, itemIds: string[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarId: true } });
  const calendarId = user?.calendarId || defaultCalendarId();
  if (!calendarId || !calendarConfigured(calendarId)) return;
  const rows = await prisma.item.findMany({ where: { userId, id: { in: itemIds }, calEventId: { not: null } }, select: { calEventId: true } });
  for (const r of rows) await deleteEvent(calendarId, r.calEventId!).catch((e) => console.error("[calendar] delete failed", e));
}
