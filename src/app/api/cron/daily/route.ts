// Daily job (Vercel Cron, 06:00 HKT):
//  1. moves each "Remind me" calendar event on to the bill's next date once a date has passed,
//     and repairs missing or outdated events,
//  2. pre-loads the main pages into the cache while the database is awake, so the first page
//     view of the day doesn't have to wake it. The cache is per day, so at 06:00 it starts empty
//     and these reads are fresh.
// ?refresh=1 only clears today's cache (use it after changing data outside the app, e.g. a fix
// script); the next page view then reads the database again.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendar } from "@/lib/remind";
import { dataChangedOutsideAction } from "@/lib/cache";
import { todayHK } from "@/lib/dates";
import { loadData } from "@/lib/schedule";
import { loadAlerts } from "@/lib/alerts";
import { loadStats } from "@/lib/stats";
import { allMethods, billPage, billsList, calendarSetting, utilitiesList } from "@/lib/reads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Same reads, same arguments as the pages, so each lands under the key a page will ask for. */
async function warm(userId: string) {
  const today = todayHK();
  const data = await loadData(userId); // Home, Calendar, Cards
  await Promise.all([
    loadAlerts(userId, data, today), // Home
    loadStats(userId, today), // Statistics
    billsList(userId), // Bills
    utilitiesList(userId), // Utilities
    allMethods(userId), // Cards
    calendarSetting(userId), // Bill and Utilities pages
  ]);
  // Each bill's page (a few at a time).
  const ids = (await prisma.item.findMany({ where: { userId }, select: { id: true } })).map((i) => i.id);
  for (let k = 0; k < ids.length; k += 5)
    await Promise.all(ids.slice(k, k + 5).flatMap((id) => [billPage(userId, id), loadData(userId, { itemId: id })]));
  return ids.length;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const okDev = !secret && process.env.NODE_ENV === "development";
  if (!okDev && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  if (new URL(req.url).searchParams.get("refresh") === "1") {
    for (const u of users) dataChangedOutsideAction(u.id);
    return NextResponse.json({ ok: true, refreshed: users.length });
  }
  const results = [];
  for (const u of users) {
    const sync = await syncCalendar(u.id, undefined, { clearCache: false });
    let warmed: number | string;
    try {
      warmed = await warm(u.id);
    } catch (e) {
      console.error("[cron] cache warm-up failed", e);
      warmed = "failed";
    }
    results.push({ user: u.username, ...sync, billsWarmed: warmed });
  }
  return NextResponse.json({ ok: true, results });
}
