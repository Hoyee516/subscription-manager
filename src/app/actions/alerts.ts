"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dataChanged } from "@/lib/cache";
import { requireUserId } from "@/lib/session";
import type { AlertKind } from "@/lib/alerts";
import type { ActionResult } from "./items";

const KINDS: AlertKind[] = [
  "PRICE_HIKE",
  "UTILITY_JUMP",
  "TRIAL_ENDING",
  "AUTO_RENEWAL",
  "CONTRACT_ENDING",
  "DUE_SOON",
  "CARD_EXPIRING",
  "NO_CARD",
  "BILL_TO_RECORD",
  "UTILITY_MISSING",
  "SYNC_FAILED",
];

/** Hides an alert for good: its key is remembered, so the same event never shows again. */
export async function dismissAlert(a: { key: string; type: AlertKind; title: string; sub: string; href: string }): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!KINDS.includes(a.type) || !a.key.startsWith(`${a.type}:`)) return { ok: false, error: "Unknown alert." };
  const existing = await prisma.alert.findUnique({ where: { dedupeKey: a.key }, select: { userId: true } });
  if (existing && existing.userId !== userId) return { ok: false, error: "Unknown alert." };
  const now = new Date();
  await prisma.alert.upsert({
    where: { dedupeKey: a.key },
    create: { userId, type: a.type, dedupeKey: a.key, message: a.title.slice(0, 300), detail: a.sub.slice(0, 300), href: a.href.slice(0, 300), dueAt: now, dismissedAt: now },
    update: { dismissedAt: now },
  });
  revalidatePath("/");
  dataChanged(userId);
  return { ok: true };
}

/** Brings a dismissed alert back (it shows again while its cause is still there). */
export async function restoreAlert(key: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const row = await prisma.alert.findUnique({ where: { dedupeKey: key }, select: { userId: true, type: true } });
  if (!row || row.userId !== userId) return { ok: false, error: "Unknown alert." };
  if (row.type === "SYNC_FAILED") await prisma.alert.update({ where: { dedupeKey: key }, data: { dismissedAt: null } });
  else await prisma.alert.delete({ where: { dedupeKey: key } });
  revalidatePath("/");
  dataChanged(userId);
  return { ok: true };
}
