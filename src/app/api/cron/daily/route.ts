// Daily job (Vercel Cron, 06:00 HKT): moves each "Remind me" calendar event on to the
// bill's next date once a date has passed, and repairs missing or outdated events.
// In-app alerts need no job: Home works them out fresh each time it opens.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendar } from "@/lib/remind";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const okDev = !secret && process.env.NODE_ENV === "development";
  if (!okDev && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const results = [];
  for (const u of users) results.push({ user: u.username, ...(await syncCalendar(u.id)) });
  return NextResponse.json({ ok: true, results });
}
